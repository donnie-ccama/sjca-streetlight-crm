from __future__ import annotations

import sys
import unittest
from unittest.mock import patch

from lib.donation_names import DonationNameSyncPlan
from scripts import twenty_import


class FakeClient:
    def __init__(self) -> None:
        self.created = 0

    def rest_get_all(self, plural: str) -> list[dict]:
        return []

    def create(self, plural: str, payload: dict) -> dict:
        self.created += 1
        return {"id": f"created-{self.created}"}

    def update(self, plural: str, record_id: str, payload: dict) -> dict:
        return {"id": record_id}


class ImportNameSyncTests(unittest.TestCase):
    def test_apply_synchronizes_only_staged_donations_after_credits(self) -> None:
        self.assertTrue(
            hasattr(twenty_import, "load_donation_name_sync_plan"),
            "the importer has no post-credit donation-name synchronization phase",
        )
        if not hasattr(twenty_import, "load_donation_name_sync_plan"):
            return

        staged = {
            "funds": [{"fundCode": "fund-1"}],
            "companies": [],
            "people": [{"externalDonorId": "person-1", "name": {"firstName": "Ada", "lastName": "Lovelace"}}],
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
        captured_scopes: list[set[str]] = []
        sync_plan = DonationNameSyncPlan(matched=1, updates=[], unresolved=[], unchanged=1)

        def load_plan(client, **kwargs):
            captured_scopes.append(kwargs["external_transaction_ids"])
            return sync_plan

        with (
            patch.object(twenty_import, "TwentyClient", return_value=FakeClient()),
            patch.object(twenty_import, "load_staged", side_effect=lambda name: staged[name]),
            patch.object(twenty_import, "load_id_map", return_value={}),
            patch.object(twenty_import, "save_id_map"),
            patch.object(twenty_import, "load_donation_name_sync_plan", side_effect=load_plan),
            patch.object(twenty_import, "apply_donation_name_sync", return_value=0) as apply_sync,
            patch.object(sys, "argv", ["twenty_import.py", "--apply"]),
        ):
            result = twenty_import.apply()

        self.assertEqual(result, 0)
        self.assertEqual(captured_scopes, [{"aplos-ic-1"}])
        apply_sync.assert_called_once_with(unittest.mock.ANY, sync_plan)


if __name__ == "__main__":
    unittest.main()
