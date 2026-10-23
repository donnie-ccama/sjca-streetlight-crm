#!/usr/bin/env python3
"""Import staged payloads into Twenty (Funds → Companies → People → Donations → Credits → Donation names).

DEFAULT IS DRY-RUN: validates structure + referential integrity against the staged
set and prints the plan. Writes NOTHING. Re-run with --apply to upsert to PRODUCTION.

Idempotency: every object upserts on its external key
  fund.fundCode / company.externalOrgId / person.externalDonorId /
  donation.externalTransactionId / donationCredit.externalCreditId
Relations are resolved to Twenty UUIDs via data/results/id-map.json, populated phase
by phase. After credits, Donation.name is synchronized from live donor relationships
only for external transaction IDs in the staged donation cohort. Re-runs resume
cleanly and never duplicate.

Usage:
  python3 scripts/twenty_import.py            # dry-run (no writes)
  python3 scripts/twenty_import.py --apply    # upsert to production
  python3 scripts/twenty_import.py --apply --only funds,companies,people
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.env import PROJECT_ROOT  # noqa: E402
from lib.donation_names import (  # noqa: E402
    DonationNameSyncApplyError,
    apply_donation_name_sync,
    load_donation_name_sync_plan,
)
from lib.twenty import TwentyClient, TwentyError  # noqa: E402

STAGED = PROJECT_ROOT / "data" / "staged"
RESULTS = PROJECT_ROOT / "data" / "results"
ID_MAP_PATH = RESULTS / "id-map.json"


def strip_hints(rec: dict) -> dict:
    """Drop _-prefixed hint fields; what's left is sent to Twenty as-is."""
    return {k: v for k, v in rec.items() if not k.startswith("_")}


# Each phase: staged file, REST plural, external key field, and a relation spec
# mapping a staged hint -> (id-map namespace, target FK field, optional?).
PHASES = [
    {"name": "funds", "plural": "funds", "key": "fundCode", "relations": []},
    {"name": "companies", "plural": "companies", "key": "externalOrgId", "relations": []},
    {"name": "people", "plural": "people", "key": "externalDonorId", "relations": []},
    {
        "name": "donations",
        "plural": "donations",
        "key": "externalTransactionId",
        "relations": [
            ("_fundCode", "fundCode", "fundId", False),
            ("_companyExternalOrgId", "externalOrgId", "companyId", True),
        ],
    },
    {
        "name": "credits",
        "plural": "donationCredits",
        "key": "externalCreditId",
        "relations": [
            ("_donationExternalTxnId", "externalTransactionId", "donationId", False),
            ("_personExternalDonorId", "externalDonorId", "personId", False),
        ],
    },
]


def parse_only_phase_names(argv: list[str]) -> set[str] | None:
    if "--only" not in argv:
        return None
    index = argv.index("--only")
    if index + 1 >= len(argv):
        raise SystemExit("--only requires a comma-separated phase list")
    names = {name.strip() for name in argv[index + 1].split(",") if name.strip()}
    valid_names = {phase["name"] for phase in PHASES}
    invalid_names = names - valid_names
    if not names:
        raise SystemExit("--only requires at least one phase")
    if invalid_names:
        raise SystemExit(f"unknown --only phase(s): {', '.join(sorted(invalid_names))}")
    return names


def load_staged(name: str) -> list[dict]:
    path = STAGED / f"{name}.json"
    if not path.is_file():
        raise SystemExit(f"Missing staged file: {path} (run transform.py first)")
    return json.loads(path.read_text())


def load_id_map() -> dict[str, dict[str, str]]:
    if ID_MAP_PATH.is_file():
        return json.loads(ID_MAP_PATH.read_text())
    return {}


def save_id_map(id_map: dict) -> None:
    RESULTS.mkdir(parents=True, exist_ok=True)
    ID_MAP_PATH.write_text(json.dumps(id_map, indent=2))


def build_payload(rec: dict, phase: dict, id_map: dict) -> tuple[dict | None, str | None]:
    """Return (payload, None) or (None, reason-it-cannot-resolve)."""
    payload = strip_hints(rec)
    for hint, ns, fk, optional in phase["relations"]:
        ref = rec.get(hint)
        if ref is None:
            if optional:
                continue
            return None, f"missing {hint}"
        uuid = id_map.get(ns, {}).get(ref)
        if uuid is None:
            return None, f"unresolved {hint}={ref} (no {ns} id yet)"
        payload[fk] = uuid
    return payload, None


def dry_run() -> int:
    """Offline: validate referential integrity against the staged keysets."""
    keysets = {
        "fundCode": {r["fundCode"] for r in load_staged("funds")},
        "externalOrgId": {r["externalOrgId"] for r in load_staged("companies")},
        "externalDonorId": {r["externalDonorId"] for r in load_staged("people")},
        "externalTransactionId": {r["externalTransactionId"] for r in load_staged("donations")},
    }
    print("=== DRY-RUN (no writes) ===")
    total_dangling = 0
    for phase in PHASES:
        recs = load_staged(phase["name"])
        dangling = []
        for r in recs:
            for hint, ns, fk, optional in phase["relations"]:
                ref = r.get(hint)
                if ref is None:
                    if not optional:
                        dangling.append((r.get(phase["key"]), f"missing {hint}"))
                    continue
                if ref not in keysets[ns]:
                    dangling.append((r.get(phase["key"]), f"{hint}={ref} not in {ns}"))
        total_dangling += len(dangling)
        rel = ", ".join(f"{fk}<-{ns}" for _, ns, fk, _ in phase["relations"]) or "(none)"
        print(f"\n{phase['name']:10} {len(recs):5} records  key={phase['key']}  relations: {rel}")
        if dangling:
            print(f"  ! {len(dangling)} dangling reference(s); first 5:")
            for key, why in dangling[:5]:
                print(f"      {key}: {why}")
        else:
            print("  all references resolve within the staged set ✓")

    plan = {phase["name"]: len(load_staged(phase["name"])) for phase in PHASES}
    plan["dangling_references"] = total_dangling
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "dry-run-plan.json").write_text(json.dumps(plan, indent=2))
    print("\n=== Planned upserts ===")
    for k in ("funds", "companies", "people", "donations", "credits"):
        print(f"  {k}: {plan[k]}")
    print(f"\nDangling references: {total_dangling}")
    if total_dangling:
        print("Resolve dangling refs before --apply.")
        return 1
    print("\nDry-run clean. Re-run with --apply to write to PRODUCTION (HALT gate cleared by you).")
    return 0


def seed_id_map(client: TwentyClient, id_map: dict) -> None:
    """Pre-load existing records' (key -> id) so re-runs update instead of duplicate."""
    for phase in PHASES:
        ns = phase["key"]
        id_map.setdefault(ns, {})
        # Twenty ignores `offset`; rest_get_all cursor-paginates via starting_after.
        for r in client.rest_get_all(phase["plural"]):
            kv = r.get(ns)
            if kv:
                id_map[ns][kv] = r["id"]
        print(f"  seeded {len(id_map[ns])} existing {phase['name']}")


def apply(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    only = parse_only_phase_names(argv)
    client = TwentyClient()
    id_map = load_id_map()
    print("=== APPLY to PRODUCTION ===\nSeeding id-map from existing records…")
    seed_id_map(client, id_map)
    save_id_map(id_map)

    totals = {}
    for phase in PHASES:
        if only is not None and phase["name"] not in only:
            continue
        ns = phase["key"]
        id_map.setdefault(ns, {})
        recs = load_staged(phase["name"])
        created = updated = skipped = failed = 0
        print(f"\n--- {phase['name']} ({len(recs)}) ---")
        for i, rec in enumerate(recs, 1):
            key_val = rec.get(ns)
            payload, reason = build_payload(rec, phase, id_map)
            if payload is None:
                skipped += 1
                print(f"  skip {key_val}: {reason}", file=sys.stderr)
                continue
            payload.pop(ns, None)  # external key passed explicitly below
            try:
                existing_id = id_map[ns].get(key_val)
                if existing_id:
                    client.update(phase["plural"], existing_id, payload)
                    updated += 1
                else:
                    try:
                        rec = client.create(phase["plural"], {**payload, ns: key_val})
                    except TwentyError as exc:
                        # A unique-email collision (with another donor or a pre-existing
                        # record) must not orphan the donor — retry without the email.
                        if "emails" in payload and ("email" in str(exc) or "duplicate" in str(exc).lower()):
                            print(f"  ~ {key_val}: dropping email and retrying", file=sys.stderr)
                            p2 = {k: v for k, v in payload.items() if k != "emails"}
                            rec = client.create(phase["plural"], {**p2, ns: key_val})
                        else:
                            raise
                    id_map[ns][key_val] = rec["id"]
                    created += 1
            except TwentyError as exc:
                failed += 1
                print(f"  ! {key_val}: {exc}", file=sys.stderr)
            if i % 100 == 0:
                save_id_map(id_map)
                print(f"  …{i}/{len(recs)}")
        save_id_map(id_map)
        totals[phase["name"]] = {"created": created, "updated": updated,
                                 "skipped": skipped, "failed": failed}
        print(f"  {phase['name']}: +{created} created, ~{updated} updated, "
              f"{skipped} skipped, {failed} failed")

    should_sync_names = only is None or "credits" in only
    upstream_issue = any(
        total["failed"] or total["skipped"] for total in totals.values()
    )
    if should_sync_names and upstream_issue:
        totals["donation_names"] = {
            "created": 0,
            "updated": 0,
            "skipped": 0,
            "failed": 1,
        }
        print(
            "\n--- donation names ---\n"
            "  ! skipped because an imported phase had failures or unresolved records",
            file=sys.stderr,
        )
    elif should_sync_names:
        external_transaction_ids = {
            record["externalTransactionId"]
            for record in load_staged("donations")
            if record.get("externalTransactionId")
        }
        print(f"\n--- donation names ({len(external_transaction_ids)} scoped) ---")
        try:
            plan = load_donation_name_sync_plan(
                client,
                external_transaction_ids=external_transaction_ids,
            )
            if plan.matched != len(external_transaction_ids):
                raise ValueError(
                    "expected "
                    f"{len(external_transaction_ids)} scoped donations, found {plan.matched}"
                )
            updated = apply_donation_name_sync(client, plan)
            totals["donation_names"] = {
                "created": 0,
                "updated": updated,
                "skipped": plan.unchanged,
                "failed": 0,
            }
            print(
                f"  donation names: ~{updated} updated, "
                f"{plan.unchanged} already correct, 0 failed"
            )
        except DonationNameSyncApplyError as exc:
            totals["donation_names"] = {
                "created": 0,
                "updated": exc.updated,
                "skipped": 0,
                "failed": 1,
            }
            print(f"  ! donation name synchronization failed: {exc}", file=sys.stderr)
        except (TwentyError, ValueError) as exc:
            totals["donation_names"] = {
                "created": 0,
                "updated": 0,
                "skipped": 0,
                "failed": 1,
            }
            print(f"  ! donation name synchronization failed: {exc}", file=sys.stderr)

    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "import-summary.json").write_text(json.dumps(totals, indent=2))
    print("\n=== Import summary ===")
    for name, t in totals.items():
        print(f"  {name}: {t}")
    return 1 if any(t["failed"] for t in totals.values()) else 0


def main() -> int:
    if "--apply" in sys.argv[1:]:
        return apply(sys.argv[1:])
    return dry_run()


if __name__ == "__main__":
    raise SystemExit(main())
