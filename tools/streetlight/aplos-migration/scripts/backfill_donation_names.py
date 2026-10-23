"""Backfill the Donation display label (`donation.name`).

Historical imports can leave `donation.name` empty even when Twenty retains the
donor relationship. This sets the label to the donor's current Twenty name:

  - individual gift  -> the HARD/DONOR credit's person ("First Last")
  - organization gift (no personal credit) -> the linked company's name

Use scope and expected-count guards for production corrections. The importer calls
the same relationship-based synchronization automatically for its staged cohort.

Usage:
    python3 scripts/backfill_donation_names.py --dry-run
    python3 scripts/backfill_donation_names.py --dry-run \
        --external-ids-from data/staged/donations.json \
        --gift-date-from 2026-08-25 --gift-date-through 2026-09-01 \
        --only-blank --expect-updates 47
    python3 scripts/backfill_donation_names.py --apply \
        --external-ids-from data/staged/donations.json \
        --gift-date-from 2026-08-25 --gift-date-through 2026-09-01 \
        --only-blank --expect-updates 47
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.donation_names import (  # noqa: E402
    DonationNameSyncApplyError,
    apply_donation_name_sync,
    load_donation_name_sync_plan,
)
from lib.twenty import TwentyClient  # noqa: E402

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="write guarded updates to production")
    mode.add_argument("--dry-run", action="store_true", help="report without writing (default)")
    parser.add_argument(
        "--external-ids-from",
        help="JSON records whose externalTransactionId values define the allowed scope",
    )
    parser.add_argument("--gift-date-from", help="inclusive YYYY-MM-DD lower bound")
    parser.add_argument("--gift-date-through", help="inclusive YYYY-MM-DD upper bound")
    parser.add_argument(
        "--only-blank",
        action="store_true",
        help="never replace a nonblank Donation.name",
    )
    parser.add_argument(
        "--expect-updates",
        type=int,
        help="abort unless the scoped plan contains exactly this many updates",
    )
    return parser


def _validate_date(value: str | None, option: str) -> None:
    if value is None:
        return
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise SystemExit(f"{option} must be YYYY-MM-DD") from exc


def main(argv: list[str] | None = None, *, client=None) -> int:
    args = build_parser().parse_args(argv)
    _validate_date(args.gift_date_from, "--gift-date-from")
    _validate_date(args.gift_date_through, "--gift-date-through")
    if (
        args.gift_date_from
        and args.gift_date_through
        and args.gift_date_from > args.gift_date_through
    ):
        raise SystemExit("--gift-date-from must not be after --gift-date-through")

    external_transaction_ids = None
    if args.external_ids_from:
        source_path = Path(args.external_ids_from)
        try:
            source_records = json.loads(source_path.read_text())
        except (OSError, json.JSONDecodeError) as exc:
            raise SystemExit(f"cannot read --external-ids-from {source_path}: {exc}") from exc
        if not isinstance(source_records, list):
            raise SystemExit("--external-ids-from must contain a JSON list")
        external_transaction_ids = {
            record["externalTransactionId"]
            for record in source_records
            if isinstance(record, dict) and record.get("externalTransactionId")
        }
        if not external_transaction_ids:
            raise SystemExit("--external-ids-from contains no externalTransactionId values")

    if args.apply:
        missing_guards = []
        if not args.external_ids_from:
            missing_guards.append("--external-ids-from")
        if not args.gift_date_from:
            missing_guards.append("--gift-date-from")
        if not args.gift_date_through:
            missing_guards.append("--gift-date-through")
        if not args.only_blank:
            missing_guards.append("--only-blank")
        if args.expect_updates is None:
            missing_guards.append("--expect-updates")
        if missing_guards:
            print(
                f"ABORT: --apply requires {' '.join(missing_guards)}",
                file=sys.stderr,
            )
            return 1

    client = client or TwentyClient()
    print("Fetching people, companies, credits, donations ...")
    plan = load_donation_name_sync_plan(
        client,
        external_transaction_ids=external_transaction_ids,
        gift_date_from=args.gift_date_from,
        gift_date_through=args.gift_date_through,
        only_blank=args.only_blank,
    )
    print(
        f"  matched={plan.matched} updates={len(plan.updates)} "
        f"unchanged={plan.unchanged} unresolved={len(plan.unresolved)}"
    )

    if args.expect_updates is not None and len(plan.updates) != args.expect_updates:
        print(
            f"ABORT: expected {args.expect_updates} updates, found {len(plan.updates)}",
            file=sys.stderr,
        )
        return 1
    if plan.unresolved:
        print(
            f"ABORT: {len(plan.unresolved)} scoped donation(s) are unresolved",
            file=sys.stderr,
        )
        return 1

    if not args.apply:
        for update in plan.updates[:15]:
            print(f"  [would set] {update.external_transaction_id}")
        print(f"\nDone. would update={len(plan.updates)}")
        return 0

    try:
        updated = apply_donation_name_sync(
            client,
            plan,
            expected_updates=args.expect_updates,
        )
    except DonationNameSyncApplyError as exc:
        print(f"ABORT: {exc}", file=sys.stderr)
        return 1
    except ValueError as exc:
        print(f"ABORT: {exc}", file=sys.stderr)
        return 1

    print(f"\nDone. updated={updated}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
