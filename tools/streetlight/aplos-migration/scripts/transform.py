#!/usr/bin/env python3
"""Transform Aplos raw exports into Twenty upsert payloads (data/staged/).

Scope (per migration decisions):
  - Donors only: the 623 contacts that appear on a gift line. Non-donor contacts
    are intentionally excluded from this pass.
  - Gift source: individual_contributions (pre-exploded per donor line).
  - Acknowledgment cutoff: gifts dated >= ACK_CUTOFF_DATE import as "Pending",
    earlier gifts as "Do Not Acknowledge" (so the thank-you workflow never fires
    on historical gifts).

Relations are emitted as `_ref` hints (external keys), resolved to Twenty UUIDs
at import time:
  donation.fund                <- _fundCode               (Fund.fundCode)
  donation.company             <- _companyExternalOrgId    (Company.externalOrgId)
  donationCredit.donation      <- _donationExternalTxnId   (Donation.externalTransactionId)
  donationCredit.person        <- _personExternalDonorId   (Person.externalDonorId)

Outputs (data/staged/): people.json, companies.json, funds.json, donations.json,
credits.json, warnings.json, _summary.json. Pure local — no API calls.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.env import PROJECT_ROOT, load_env  # noqa: E402
from lib.money import money, to_micros  # noqa: E402

RAW = PROJECT_ROOT / "data" / "raw"
STAGED = PROJECT_ROOT / "data" / "staged"

# External-key schemes (idempotency).
CONTACT_KEY = "aplos-contact-{}"   # Person.externalDonorId / Company.externalOrgId
GIFT_KEY = "aplos-ic-{}"           # Donation.externalTransactionId (individual_contributions row id)
PURPOSE_KEY = "aplos-purpose-{}"   # Fund.fundCode
CREDIT_KEY = "aplos-credit-{}"     # DonationCredit.externalCreditId (1 Hard credit per gift line)
# Accounting-deposit lines (contributions/{id}.lines) — separate id space from individual_contributions.
DEPOSIT_GIFT_KEY = "aplos-cl-{}"
DEPOSIT_CREDIT_KEY = "aplos-credit-cl-{}"

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")  # Twenty rejects non-email strings


def load(name: str):
    return json.loads((RAW / f"{name}.json").read_text())


def contact_name(ct: dict) -> tuple[str, str, str]:
    """Return (firstName, lastName, companyName) from a contact-like dict."""
    return (
        (ct.get("firstname") or "").strip(),
        (ct.get("lastname") or "").strip(),
        (ct.get("companyname") or "").strip(),
    )


def main() -> int:
    env = load_env()
    cutoff = (env.get("ACK_CUTOFF_DATE") or "").strip()
    if not cutoff:
        raise SystemExit("ACK_CUTOFF_DATE not set in .env")

    contacts = load("contacts")
    ic = load("individual_contributions")
    for r in ic:
        r["_giftKey"], r["_creditKey"] = GIFT_KEY.format(r.get("id")), CREDIT_KEY.format(r.get("id"))
    # individual_contributions omits most 2021-09..2026-05 gifts; deposit lines fill that gap.
    if (RAW / "contribution_lines.json").is_file():
        for r in load("contribution_lines"):
            r["_giftKey"] = DEPOSIT_GIFT_KEY.format(r.get("id"))
            r["_creditKey"] = DEPOSIT_CREDIT_KEY.format(r.get("id"))
            ic.append(r)
    purposes = load("purposes")

    # Index the full contact universe by id (authoritative email / names / flags).
    contact_by_id: dict[int, dict] = {c["id"]: c for c in contacts if c.get("id") is not None}

    warnings: list[str] = []

    # --- Funds (all purposes; few, harmless to include unused) -------------
    funds = []
    for p in purposes:
        pid = p.get("id")
        if pid is None:
            continue
        funds.append(
            {
                "fundCode": PURPOSE_KEY.format(pid),
                "name": (p.get("name") or f"Purpose {pid}").strip(),
                "isActive": bool(p.get("is_enabled", True)),
                "_aplosPurposeId": pid,
                "_aplosParentFund": (p.get("fund") or {}).get("name"),
            }
        )
    fund_code_by_purpose = {f["_aplosPurposeId"]: f["fundCode"] for f in funds}

    # --- Donors (only contacts that appear on a gift line) -----------------
    # Prefer the full contact record; fall back to the name embedded in the gift.
    donor_ids: dict[int, dict] = {}  # id -> best-known contact dict
    for r in ic:
        ct = r.get("contact") or {}
        cid = ct.get("id")
        if cid is None:
            warnings.append(f"gift {r.get('id')}: line has no contact id; skipped donor")
            continue
        base = dict(contact_by_id.get(cid, {}))
        # Merge embedded name fields where the universe record lacks them.
        for k in ("firstname", "lastname", "companyname", "type"):
            if not base.get(k) and ct.get(k):
                base[k] = ct[k]
        base.setdefault("id", cid)
        donor_ids[cid] = base

    people, companies = [], []
    person_key_by_id: dict[int, str] = {}
    company_key_by_id: dict[int, str] = {}
    seen_emails: set[str] = set()  # Twenty enforces a unique primaryEmail

    for cid, ct in donor_ids.items():
        ext = CONTACT_KEY.format(cid)
        first, last, company = contact_name(ct)
        ctype = ct.get("type")
        email = (ct.get("email") or "").strip()
        if ctype == "company" or (not first and not last and company):
            name = company or f"Company {cid}"
            companies.append({"externalOrgId": ext, "name": name, "_aplosContactId": cid})
            company_key_by_id[cid] = ext
        else:
            if not first and not last:
                warnings.append(f"contact {cid}: individual donor with no name")
            rec = {
                "externalDonorId": ext,
                "name": {"firstName": first or "(Unknown)", "lastName": last or ""},
                "_aplosContactId": cid,
            }
            # Only attach an email if it is email-shaped and not already used.
            if email:
                low = email.lower()
                if not EMAIL_RE.match(email):
                    warnings.append(f"contact {cid}: dropped non-email email {email!r}")
                elif low in seen_emails:
                    warnings.append(f"contact {cid}: dropped duplicate email {email!r}")
                else:
                    seen_emails.add(low)
                    rec["emails"] = {"primaryEmail": email}
            people.append(rec)
            person_key_by_id[cid] = ext

    # --- Donations + Donation Credits (one per gift line) ------------------
    donations, credits = [], []
    pending = do_not_ack = 0
    for r in ic:
        gid = r.get("id")
        if gid is None:
            warnings.append("gift line with no id; skipped")
            continue
        ct = r.get("contact") or {}
        cid = ct.get("id")
        txn = r["_giftKey"]
        gift_date = r.get("date")
        amount = r.get("amount") or 0
        ntd = r.get("ntd_amount") or 0
        fee = r.get("expense_amount") or 0
        purpose = r.get("purpose") or {}
        pid = purpose.get("id")
        fund_code = fund_code_by_purpose.get(pid)
        if pid is not None and fund_code is None:
            warnings.append(f"gift {gid}: purpose {pid} not in purposes export")

        if gift_date and gift_date >= cutoff:
            ack = "PENDING"
            pending += 1
        else:
            ack = "DO_NOT_ACKNOWLEDGE"
            do_not_ack += 1

        donation = {
            "externalTransactionId": txn,
            "amount": money(amount),
            "giftDate": gift_date,
            "processingFee": money(fee),
            "goodsOrServicesProvided": bool(ntd and float(ntd) > 0),
            "goodsOrServicesValue": money(ntd),
            "acknowledgmentStatus": ack,
            "_fundCode": fund_code,
            "_aplosLineId": gid,
            "_aplosContactId": cid,
        }

        is_company = cid in company_key_by_id
        if is_company:
            donation["_companyExternalOrgId"] = company_key_by_id[cid]
        donations.append(donation)

        # Hard credit links the individual donor to the gift. Company donors use
        # Donation.company directly (no Person credit), per the NPSP pattern.
        if not is_company and cid in person_key_by_id:
            deductible = to_micros(amount) - to_micros(ntd)
            credits.append(
                {
                    "externalCreditId": r["_creditKey"],
                    "_donationExternalTxnId": txn,
                    "_personExternalDonorId": person_key_by_id[cid],
                    "creditType": "HARD",
                    "creditRole": "DONOR",
                    "creditAmount": money(amount),
                    "includeInStatement": deductible > 0,
                    "_aplosLineId": gid,
                    "_aplosContactId": cid,
                }
            )

    # --- Write staged payloads --------------------------------------------
    STAGED.mkdir(parents=True, exist_ok=True)
    outputs = {
        "funds": funds,
        "companies": companies,
        "people": people,
        "donations": donations,
        "credits": credits,
        "warnings": warnings,
    }
    for name, data in outputs.items():
        (STAGED / f"{name}.json").write_text(json.dumps(data, indent=2))

    total_gift_micros = sum(d["amount"]["amountMicros"] for d in donations)
    total_fee_micros = sum(d["processingFee"]["amountMicros"] for d in donations)
    summary = {
        "scope": "donors-only",
        "ack_cutoff_date": cutoff,
        "funds": len(funds),
        "people": len(people),
        "companies": len(companies),
        "donations": len(donations),
        "credits": len(credits),
        "donations_pending_ack": pending,
        "donations_do_not_ack": do_not_ack,
        "total_gift_usd": total_gift_micros / 1_000_000,
        "total_processing_fee_usd": total_fee_micros / 1_000_000,
        "warnings": len(warnings),
    }
    (STAGED / "_summary.json").write_text(json.dumps(summary, indent=2))

    print("=== Transform summary ===")
    for k, v in summary.items():
        print(f"  {k}: {v}")
    if warnings:
        print(f"\nFirst warnings ({min(10, len(warnings))} of {len(warnings)}):")
        for w in warnings[:10]:
            print(f"  ! {w}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
