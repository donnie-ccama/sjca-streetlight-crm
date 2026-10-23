from __future__ import annotations

import inspect
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from scripts import backfill_donation_names


class FakeClient:
    def __init__(self) -> None:
        self.records = {
            "people": [
                {"id": "person-1", "name": {"firstName": "Ada", "lastName": "Lovelace"}}
            ],
            "companies": [],
            "donationCredits": [
                {
                    "donationId": "donation-1",
                    "personId": "person-1",
                    "creditType": "HARD",
                    "creditRole": "DONOR",
                }
            ],
            "donations": [
                {
                    "id": "donation-1",
                    "externalTransactionId": "aplos-ic-1",
                    "giftDate": "2026-09-01",
                    "name": "",
                    "companyId": None,
                }
            ],
        }
        self.updates: list[tuple[str, str, dict]] = []

    def rest_get_all(self, plural: str) -> list[dict]:
        return self.records[plural]

    def update(self, plural: str, record_id: str, payload: dict) -> dict:
        self.updates.append((plural, record_id, payload))
        return {"id": record_id}


class BackfillDonationNamesTests(unittest.TestCase):
    def test_cli_accepts_guarded_source_and_date_scope_without_writing(self) -> None:
        parameters = inspect.signature(backfill_donation_names.main).parameters
        self.assertIn("argv", parameters, "backfill CLI does not accept scoped arguments")
        self.assertIn("client", parameters, "backfill CLI cannot be exercised safely with an injected client")
        parser = backfill_donation_names.build_parser()
        self.assertIn(
            "--external-ids-from",
            parser._option_string_actions,
            "backfill scope cannot be restricted to source external IDs",
        )
        if (
            "argv" not in parameters
            or "client" not in parameters
            or "--external-ids-from" not in parser._option_string_actions
        ):
            return

        client = FakeClient()
        with TemporaryDirectory() as directory:
            source_path = Path(directory) / "donations.json"
            source_path.write_text(
                json.dumps([{"externalTransactionId": "aplos-ic-1"}])
            )
            result = backfill_donation_names.main(
                [
                    "--dry-run",
                    "--external-ids-from",
                    str(source_path),
                    "--gift-date-from",
                    "2026-08-25",
                    "--gift-date-through",
                    "2026-09-01",
                    "--only-blank",
                    "--expect-updates",
                    "1",
                ],
                client=client,
            )

        self.assertEqual(result, 0)
        self.assertEqual(client.updates, [])

    def test_no_arguments_is_a_read_only_dry_run(self) -> None:
        client = FakeClient()

        result = backfill_donation_names.main([], client=client)

        self.assertEqual(result, 0)
        self.assertEqual(client.updates, [])

    def test_apply_requires_every_scope_guard(self) -> None:
        parser = backfill_donation_names.build_parser()
        self.assertIn("--apply", parser._option_string_actions)
        if "--apply" not in parser._option_string_actions:
            return
        client = FakeClient()

        result = backfill_donation_names.main(["--apply"], client=client)

        self.assertEqual(result, 1)
        self.assertEqual(client.updates, [])

    def test_dry_run_fails_when_a_scoped_donation_is_unresolved(self) -> None:
        client = FakeClient()
        client.records["donations"].append(
            {
                "id": "donation-2",
                "externalTransactionId": "aplos-ic-2",
                "giftDate": "2026-09-01",
                "name": "",
                "companyId": None,
            }
        )

        result = backfill_donation_names.main(
            ["--dry-run", "--only-blank", "--expect-updates", "1"],
            client=client,
        )

        self.assertEqual(result, 1)
        self.assertEqual(client.updates, [])


if __name__ == "__main__":
    unittest.main()
