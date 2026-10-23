from __future__ import annotations

import unittest

try:
    from lib import donation_names
except ImportError:
    donation_names = None


class FakeClient:
    def __init__(self) -> None:
        self.updates: list[tuple[str, str, dict]] = []

    def update(self, plural: str, record_id: str, payload: dict) -> None:
        self.updates.append((plural, record_id, payload))


class DonationNameSyncTests(unittest.TestCase):
    def plan(self, **overrides):
        self.assertTrue(
            hasattr(donation_names, "plan_donation_name_sync"),
            "relationship-based donation name synchronization is not implemented",
        )
        kwargs = {
            "donations": [
                {
                    "id": "donation-1",
                    "externalTransactionId": "aplos-ic-1",
                    "giftDate": "2026-09-01",
                    "name": "",
                    "companyId": None,
                }
            ],
            "credits": [
                {
                    "donationId": "donation-1",
                    "personId": "person-1",
                    "creditType": "HARD",
                    "creditRole": "DONOR",
                }
            ],
            "people": [{"id": "person-1", "name": {"firstName": "Ada", "lastName": "Lovelace"}}],
            "companies": [],
        }
        kwargs.update(overrides)
        return donation_names.plan_donation_name_sync(**kwargs)

    def test_uses_hard_donor_person_name(self) -> None:
        plan = self.plan(
            credits=[
                {"donationId": "donation-1", "personId": "person-2", "creditType": "SOFT"},
                {
                    "donationId": "donation-1",
                    "personId": "person-1",
                    "creditType": "HARD",
                    "creditRole": "DONOR",
                },
            ],
            people=[
                {"id": "person-1", "name": {"firstName": "Ada", "lastName": "Lovelace"}},
                {"id": "person-2", "name": {"firstName": "Grace", "lastName": "Hopper"}},
            ],
        )

        self.assertEqual([(u.donation_id, u.target_name) for u in plan.updates], [("donation-1", "Ada Lovelace")])
        self.assertEqual(plan.unresolved, [])

    def test_falls_back_to_company_name(self) -> None:
        plan = self.plan(
            donations=[
                {
                    "id": "donation-1",
                    "externalTransactionId": "aplos-ic-1",
                    "giftDate": "2026-09-01",
                    "name": "",
                    "companyId": "company-1",
                }
            ],
            credits=[],
            people=[],
            companies=[{"id": "company-1", "name": "Analytical Engines Ltd"}],
        )

        self.assertEqual([u.target_name for u in plan.updates], ["Analytical Engines Ltd"])

    def test_limits_updates_to_external_transaction_scope(self) -> None:
        plan = self.plan(external_transaction_ids={"aplos-ic-other"})

        self.assertEqual(plan.matched, 0)
        self.assertEqual(plan.updates, [])
        self.assertEqual(plan.unresolved, [])

    def test_filters_by_inclusive_gift_date_and_blank_name(self) -> None:
        plan = self.plan(
            gift_date_from="2026-08-25",
            gift_date_through="2026-09-01",
            only_blank=True,
        )
        outside = self.plan(gift_date_from="2026-08-01", gift_date_through="2026-08-31")
        nonblank = self.plan(
            donations=[
                {
                    "id": "donation-1",
                    "externalTransactionId": "aplos-ic-1",
                    "giftDate": "2026-09-01",
                    "name": "Existing label",
                    "companyId": None,
                }
            ],
            only_blank=True,
        )

        self.assertEqual(plan.matched, 1)
        self.assertEqual(len(plan.updates), 1)
        self.assertEqual(outside.matched, 0)
        self.assertEqual(nonblank.matched, 1)
        self.assertEqual(nonblank.updates, [])

    def test_reports_scoped_donations_without_a_resolvable_relationship(self) -> None:
        plan = self.plan(credits=[], people=[], companies=[])

        self.assertEqual(plan.updates, [])
        self.assertEqual(plan.unresolved, ["aplos-ic-1"])

    def test_expected_update_guard_prevents_partial_production_write(self) -> None:
        self.assertTrue(
            hasattr(donation_names, "apply_donation_name_sync"),
            "expected-count write guard is not implemented",
        )
        client = FakeClient()
        plan = self.plan()

        with self.assertRaisesRegex(ValueError, "expected 47 updates, found 1"):
            donation_names.apply_donation_name_sync(client, plan, expected_updates=47)

        self.assertEqual(client.updates, [])


if __name__ == "__main__":
    unittest.main()
