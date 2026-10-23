from __future__ import annotations

import unittest

from lib import donation_names


class RecordingClient:
    def __init__(self, fail_on_call: int | None = None) -> None:
        self.fail_on_call = fail_on_call
        self.updates: list[tuple[str, str, dict]] = []

    def update(self, plural: str, record_id: str, payload: dict) -> dict:
        if self.fail_on_call == len(self.updates) + 1:
            raise RuntimeError("API failure")
        self.updates.append((plural, record_id, payload))
        return {"id": record_id}


class DonationNameSafetyTests(unittest.TestCase):
    def test_soft_credit_does_not_replace_company_donor(self) -> None:
        plan = donation_names.plan_donation_name_sync(
            donations=[
                {
                    "id": "donation-1",
                    "externalTransactionId": "aplos-ic-1",
                    "giftDate": "2026-09-01",
                    "name": "",
                    "companyId": "company-1",
                }
            ],
            credits=[
                {
                    "donationId": "donation-1",
                    "personId": "person-1",
                    "creditType": "SOFT",
                    "creditRole": "SOLICITOR",
                }
            ],
            people=[
                {"id": "person-1", "name": {"firstName": "Soft", "lastName": "Credit"}}
            ],
            companies=[{"id": "company-1", "name": "Company Donor"}],
        )

        self.assertEqual([update.target_name for update in plan.updates], ["Company Donor"])

    def test_apply_error_reports_completed_updates(self) -> None:
        self.assertTrue(
            hasattr(donation_names, "DonationNameSyncApplyError"),
            "partial update failures do not report completed writes",
        )
        if not hasattr(donation_names, "DonationNameSyncApplyError"):
            return

        plan = donation_names.DonationNameSyncPlan(
            matched=2,
            updates=[
                donation_names.DonationNameUpdate("donation-1", "aplos-ic-1", "", "Ada"),
                donation_names.DonationNameUpdate("donation-2", "aplos-ic-2", "", "Grace"),
            ],
            unresolved=[],
            unchanged=0,
        )
        client = RecordingClient(fail_on_call=2)

        with self.assertRaises(donation_names.DonationNameSyncApplyError) as caught:
            donation_names.apply_donation_name_sync(client, plan)

        self.assertEqual(caught.exception.updated, 1)
        self.assertEqual(client.updates, [("donations", "donation-1", {"name": "Ada"})])


if __name__ == "__main__":
    unittest.main()
