"""Plan and apply Donation.name values from Twenty donor relationships."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Protocol


class DonationUpdater(Protocol):
    def update(self, object_plural: str, record_id: str, payload: dict) -> dict: ...


@dataclass(frozen=True)
class DonationNameUpdate:
    donation_id: str
    external_transaction_id: str
    current_name: str
    target_name: str


@dataclass(frozen=True)
class DonationNameSyncPlan:
    matched: int
    updates: list[DonationNameUpdate]
    unresolved: list[str]
    unchanged: int


class DonationNameSyncApplyError(RuntimeError):
    def __init__(self, updated: int, external_transaction_id: str, cause: RuntimeError) -> None:
        self.updated = updated
        self.external_transaction_id = external_transaction_id
        super().__init__(
            f"stopped after {updated} update(s) at {external_transaction_id}: {cause}"
        )


def person_label(person: dict) -> str:
    name = person.get("name") or {}
    parts = (name.get("firstName") or "", name.get("lastName") or "")
    return " ".join(part.strip() for part in parts if part and part.strip()).strip()


def pick_donor_credit(credits: Iterable[dict]) -> dict | None:
    credits = list(credits)
    for credit in credits:
        if (
            credit.get("creditType") == "HARD"
            and credit.get("creditRole") == "DONOR"
            and credit.get("personId")
        ):
            return credit
    return None


def _in_scope(
    donation: dict,
    external_transaction_ids: set[str] | None,
    gift_date_from: str | None,
    gift_date_through: str | None,
) -> bool:
    external_id = donation.get("externalTransactionId")
    if external_transaction_ids is not None and external_id not in external_transaction_ids:
        return False
    gift_date = str(donation.get("giftDate") or "")[:10]
    if gift_date_from is not None and gift_date < gift_date_from:
        return False
    if gift_date_through is not None and gift_date > gift_date_through:
        return False
    return True


def plan_donation_name_sync(
    *,
    donations: Iterable[dict],
    credits: Iterable[dict],
    people: Iterable[dict],
    companies: Iterable[dict],
    external_transaction_ids: set[str] | None = None,
    gift_date_from: str | None = None,
    gift_date_through: str | None = None,
    only_blank: bool = False,
) -> DonationNameSyncPlan:
    """Return relationship-derived label updates for the requested donation scope."""
    people_by_id = {person["id"]: person_label(person) for person in people}
    companies_by_id = {
        company["id"]: (company.get("name") or "").strip() for company in companies
    }
    credits_by_donation_id: dict[str, list[dict]] = {}
    for credit in credits:
        donation_id = credit.get("donationId")
        if donation_id:
            credits_by_donation_id.setdefault(donation_id, []).append(credit)

    matched = unchanged = 0
    updates: list[DonationNameUpdate] = []
    unresolved: list[str] = []
    for donation in donations:
        if not _in_scope(
            donation,
            external_transaction_ids,
            gift_date_from,
            gift_date_through,
        ):
            continue

        matched += 1
        donation_id = donation["id"]
        external_id = donation.get("externalTransactionId") or donation_id
        current_name = (donation.get("name") or "").strip()
        if only_blank and current_name:
            unchanged += 1
            continue

        target_name = ""
        credit = pick_donor_credit(credits_by_donation_id.get(donation_id, []))
        if credit:
            target_name = people_by_id.get(credit["personId"], "")
        if not target_name and donation.get("companyId"):
            target_name = companies_by_id.get(donation["companyId"], "")

        if not target_name:
            unresolved.append(external_id)
        elif current_name == target_name:
            unchanged += 1
        else:
            updates.append(
                DonationNameUpdate(
                    donation_id=donation_id,
                    external_transaction_id=external_id,
                    current_name=current_name,
                    target_name=target_name,
                )
            )

    return DonationNameSyncPlan(
        matched=matched,
        updates=updates,
        unresolved=unresolved,
        unchanged=unchanged,
    )


def load_donation_name_sync_plan(
    client,
    *,
    external_transaction_ids: set[str] | None = None,
    gift_date_from: str | None = None,
    gift_date_through: str | None = None,
    only_blank: bool = False,
) -> DonationNameSyncPlan:
    """Load Twenty relationship data and build a synchronization plan."""
    return plan_donation_name_sync(
        donations=client.rest_get_all("donations"),
        credits=client.rest_get_all("donationCredits"),
        people=client.rest_get_all("people"),
        companies=client.rest_get_all("companies"),
        external_transaction_ids=external_transaction_ids,
        gift_date_from=gift_date_from,
        gift_date_through=gift_date_through,
        only_blank=only_blank,
    )


def apply_donation_name_sync(
    client: DonationUpdater,
    plan: DonationNameSyncPlan,
    *,
    expected_updates: int | None = None,
) -> int:
    """Apply a precomputed plan only after all write guards pass."""
    if expected_updates is not None and len(plan.updates) != expected_updates:
        raise ValueError(f"expected {expected_updates} updates, found {len(plan.updates)}")
    if plan.unresolved:
        raise ValueError(f"refusing partial update: {len(plan.unresolved)} donation(s) unresolved")

    updated = 0
    for update in plan.updates:
        try:
            client.update("donations", update.donation_id, {"name": update.target_name})
        except RuntimeError as exc:
            raise DonationNameSyncApplyError(
                updated,
                update.external_transaction_id,
                exc,
            ) from exc
        updated += 1
    return updated
