from __future__ import annotations

import sys
import unittest
from unittest.mock import patch

from lib.twenty import TwentyError
from scripts import twenty_import


STAGED = {
    "funds": [{"fundCode": "fund-1"}],
    "companies": [],
    "people": [
        {"externalDonorId": "person-1", "name": {"firstName": "Ada", "lastName": "Lovelace"}}
    ],
    "donations": [
        {
            "externalTransactionId": "aplos-ic-1",
            "amount": {"amountMicros": 1000000, "currencyCode": "USD"},
            "giftDate": "2026-09-01",
            "_fundCode": "fund-1",
        }
    ],
    "credits": [
        {
            "externalCreditId": "aplos-credit-1",
            "_donationExternalTxnId": "aplos-ic-1",
            "_personExternalDonorId": "person-1",
            "creditType": "HARD",
            "creditRole": "DONOR",
        }
    ],
}


class CreditFailingClient:
    def __init__(self) -> None:
        self.created = 0

    def rest_get_all(self, plural: str) -> list[dict]:
        return []

    def create(self, plural: str, payload: dict) -> dict:
        if plural == "donationCredits":
            raise TwentyError("credit failed")
        self.created += 1
        return {"id": f"created-{self.created}"}

    def update(self, plural: str, record_id: str, payload: dict) -> dict:
        return {"id": record_id}


class ImportSafetyTests(unittest.TestCase):
    def test_only_phase_selection_rejects_empty_or_unknown_names(self) -> None:
        self.assertTrue(
            hasattr(twenty_import, "parse_only_phase_names"),
            "--only is not validated before production work",
        )
        if not hasattr(twenty_import, "parse_only_phase_names"):
            return

        with self.assertRaises(SystemExit):
            twenty_import.parse_only_phase_names(["--apply", "--only", ""])
        with self.assertRaises(SystemExit):
            twenty_import.parse_only_phase_names(["--apply", "--only", "donatoins"])

    def test_failed_credit_phase_prevents_name_synchronization(self) -> None:
        self.assertTrue(
            hasattr(twenty_import, "load_donation_name_sync_plan"),
            "post-credit name synchronization is not implemented",
        )
        if not hasattr(twenty_import, "load_donation_name_sync_plan"):
            return

        with (
            patch.object(twenty_import, "TwentyClient", return_value=CreditFailingClient()),
            patch.object(twenty_import, "load_staged", side_effect=lambda name: STAGED[name]),
            patch.object(twenty_import, "load_id_map", return_value={}),
            patch.object(twenty_import, "save_id_map"),
            patch.object(twenty_import, "load_donation_name_sync_plan") as load_plan,
            patch.object(sys, "argv", ["twenty_import.py", "--apply"]),
        ):
            result = twenty_import.apply()

        self.assertEqual(result, 1)
        load_plan.assert_not_called()


if __name__ == "__main__":
    unittest.main()
