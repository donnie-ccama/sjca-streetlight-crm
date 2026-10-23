#!/usr/bin/env python3
"""Reconcile Aplos source vs Twenty target after import. Read-only; writes a report.

Compares record counts and dollar totals:
  - Aplos individual_contributions (raw)  vs  Twenty Donations + Donation Credits
  - Aplos donor contacts                  vs  Twenty People + Companies (by external key)
  - Aplos gift total $                     vs  Twenty donation amount total + hard-credit total

Emits data/results/reconciliation.md. Run after twenty_import.py --apply.

Usage:
  python3 scripts/reconcile.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.env import PROJECT_ROOT  # noqa: E402
from lib.money import micros_to_dollars, to_micros  # noqa: E402
from lib.twenty import TwentyClient, TwentyError  # noqa: E402

RAW = PROJECT_ROOT / "data" / "raw"
STAGED = PROJECT_ROOT / "data" / "staged"
RESULTS = PROJECT_ROOT / "data" / "results"


def aplos_side() -> dict:
    ic = json.loads((RAW / "individual_contributions.json").read_text())
    gift_micros = sum(to_micros(r.get("amount")) for r in ic)
    indiv = sum(1 for r in ic if (r.get("contact") or {}).get("type") != "company")
    company = len(ic) - indiv
    donors = {(r.get("contact") or {}).get("id") for r in ic}
    return {
        "gift_lines": len(ic),
        "individual_lines": indiv,
        "company_lines": company,
        "unique_donors": len(donors),
        "gift_total_micros": gift_micros,
    }


def twenty_count_and_sum(client: TwentyClient, plural: str, amount_field: str | None):
    """Paginate a REST object; return (count, summed amountMicros for amount_field)."""
    count = 0
    micros = 0
    # Twenty ignores `offset`; rest_get_all cursor-paginates via starting_after.
    for r in client.rest_get_all(plural):
        count += 1
        if amount_field:
            amt = r.get(amount_field) or {}
            micros += int(amt.get("amountMicros") or 0)
    return count, micros


def main() -> int:
    client = TwentyClient()
    a = aplos_side()
    try:
        people, _ = twenty_count_and_sum(client, "people", None)
        companies, _ = twenty_count_and_sum(client, "companies", None)
        donations, donation_micros = twenty_count_and_sum(client, "donations", "amount")
        credits, credit_micros = twenty_count_and_sum(client, "donationCredits", "creditAmount")
        funds, _ = twenty_count_and_sum(client, "funds", None)
    except TwentyError as exc:
        print(f"FAILED reading Twenty: {exc}", file=sys.stderr)
        return 1

    def row(label, aplos_v, twenty_v):
        match = "✓" if aplos_v == twenty_v else "✗"
        return f"| {label} | {aplos_v} | {twenty_v} | {match} |"

    lines = [
        "# Aplos → Twenty Reconciliation",
        "",
        "| Metric | Aplos | Twenty | Match |",
        "|---|---|---|---|",
        row("Gift lines → Donations", a["gift_lines"], donations),
        row("Individual lines → Hard credits", a["individual_lines"], credits),
        row("Unique donors → People+Companies", a["unique_donors"], people + companies),
        row(
            "Gift total $ → Donation total $",
            f"${micros_to_dollars(a['gift_total_micros'])}",
            f"${micros_to_dollars(donation_micros)}",
        ),
        row(
            "Gift total $ → Hard-credit total $ (individuals only)",
            f"${micros_to_dollars(a['gift_total_micros'])}",
            f"${micros_to_dollars(credit_micros)}",
        ),
        "",
        f"- Twenty People: {people}, Companies: {companies}, Funds: {funds}",
        f"- Aplos individual lines: {a['individual_lines']}, company lines: {a['company_lines']}",
        "",
        "_Note: hard-credit total covers individual-donor gifts only; company-donor gifts "
        "attach to Donation.company without a Person credit, so credit total < donation total "
        "by the company-gift amount (expected)._",
    ]
    report = "\n".join(lines)
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "reconciliation.md").write_text(report + "\n")
    print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
