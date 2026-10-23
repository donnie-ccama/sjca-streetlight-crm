#!/usr/bin/env python3
"""Provision the Streetlight CRM donor schema through Twenty Metadata GraphQL."""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
API_DELAY_SEC = 0.5

PERSON_ID = "17c8bab9-26e3-43bc-8071-23c9acbad5e8"
COMPANY_ID = "a5fdd822-52e5-4f8a-8832-811bc1906062"
HOUSEHOLD_ID = "135b11b6-7178-436c-aa2d-8f13bc9f8d3f"

COLORS = ["blue", "green", "orange", "red", "purple", "turquoise", "yellow", "pink"]


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.is_file():
        sys.exit(f"Missing env file: {path}")
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip().strip('"').strip("'")
    for key in ("TWENTY_API_URL", "TWENTY_API_KEY"):
        if not env.get(key):
            sys.exit(f"Missing {key} in {path}")
    return env


def select_value(label: str) -> str:
    """Twenty SELECT option values must be UPPER_SNAKE_CASE."""
    normalized = label.upper().replace("-", " ").replace("/", " ")
    return re.sub(r"[^A-Z0-9]+", "_", normalized).strip("_")


def select_options(labels: list[str]) -> list[dict[str, Any]]:
    return [
        {
            "value": select_value(label),
            "label": label,
            "position": i,
            "color": COLORS[i % len(COLORS)],
        }
        for i, label in enumerate(labels)
    ]


class TwentyMetadataClient:
    def __init__(self, api_url: str, api_key: str) -> None:
        self.endpoint = f"{api_url.rstrip('/')}/metadata"
        self.api_key = api_key

    def gql(self, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        time.sleep(API_DELAY_SEC)
        body = json.dumps({"query": query, "variables": variables or {}}).encode()
        req = urllib.request.Request(
            self.endpoint,
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
                "User-Agent": "Streetlight-CRM-provision-schema/1.0 (Twenty Metadata API)",
                "Accept": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req) as resp:
                payload = json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")
            raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc
        if payload.get("errors"):
            raise RuntimeError(json.dumps(payload["errors"], indent=2))
        return payload["data"]

    def list_objects(self) -> dict[str, dict[str, Any]]:
        query = """
        query ListObjects {
          objects(paging: { first: 500 }) {
            edges {
              node {
                id
                nameSingular
                labelSingular
                fields(paging: { first: 500 }) {
                  edges { node { name type label } }
                }
              }
            }
          }
        }
        """
        data = self.gql(query)
        by_name: dict[str, dict[str, Any]] = {}
        for edge in data["objects"]["edges"]:
            node = edge["node"]
            fields = {f["node"]["name"]: f["node"] for f in node["fields"]["edges"]}
            by_name[node["nameSingular"]] = {
                "id": node["id"],
                "nameSingular": node["nameSingular"],
                "labelSingular": node["labelSingular"],
                "fields": fields,
            }
        return by_name

    def create_object(self, spec: dict[str, str]) -> str:
        mutation = """
        mutation CreateObject($input: CreateOneObjectInput!) {
          createOneObject(input: $input) { id nameSingular }
        }
        """
        data = self.gql(
            mutation,
            {
                "input": {
                    "object": {
                        "nameSingular": spec["nameSingular"],
                        "namePlural": spec["namePlural"],
                        "labelSingular": spec["labelSingular"],
                        "labelPlural": spec["labelPlural"],
                        "icon": spec.get("icon", "IconBox"),
                        "description": spec.get("description"),
                    }
                }
            },
        )
        return data["createOneObject"]["id"]

    def create_field(self, object_id: str, field: dict[str, Any]) -> None:
        mutation = """
        mutation CreateField($input: CreateOneFieldMetadataInput!) {
          createOneField(input: $input) { id name type }
        }
        """
        payload = dict(field)
        payload["objectMetadataId"] = object_id
        payload.setdefault("isCustom", True)
        self.gql(mutation, {"input": {"field": payload}})


OBJECT_SPECS = [
    {
        "nameSingular": "household",
        "namePlural": "households",
        "labelSingular": "Household",
        "labelPlural": "Households",
        "icon": "IconHome",
        "knownId": HOUSEHOLD_ID,
    },
    {
        "nameSingular": "householdMember",
        "namePlural": "householdMembers",
        "labelSingular": "Household Member",
        "labelPlural": "Household Members",
        "icon": "IconUsers",
    },
    {
        "nameSingular": "donation",
        "namePlural": "donations",
        "labelSingular": "Donation",
        "labelPlural": "Donations",
        "icon": "IconHeartHandshake",
    },
    {
        "nameSingular": "donationCredit",
        "namePlural": "donationCredits",
        "labelSingular": "Donation Credit",
        "labelPlural": "Donation Credits",
        "icon": "IconArrowsSplit",
        "description": "NPSP Opportunity Contact Role (OCR) — hard/soft credit allocation",
    },
    {
        "nameSingular": "fund",
        "namePlural": "funds",
        "labelSingular": "Fund",
        "labelPlural": "Funds",
        "icon": "IconBuildingBank",
    },
    {
        "nameSingular": "fundraisingCampaign",
        "namePlural": "fundraisingCampaigns",
        "labelSingular": "Fundraising Campaign",
        "labelPlural": "Fundraising Campaigns",
        "icon": "IconTargetArrow",
    },
    {
        "nameSingular": "pledge",
        "namePlural": "pledges",
        "labelSingular": "Pledge",
        "labelPlural": "Pledges",
        "icon": "IconCalendarDollar",
    },
]


def scalar_field(
    name: str,
    label: str,
    field_type: str,
    *,
    options: list[dict[str, Any]] | None = None,
    icon: str | None = None,
) -> dict[str, Any]:
    f: dict[str, Any] = {"type": field_type, "name": name, "label": label}
    if options is not None:
        f["options"] = options
    if icon:
        f["icon"] = icon
    return f


def relation_field(
    name: str,
    label: str,
    target_object_id: str,
    *,
    inverse_label: str,
    icon: str = "IconLink",
) -> dict[str, Any]:
    return {
        "type": "RELATION",
        "name": name,
        "label": label,
        "icon": icon,
        "relationCreationPayload": {
            "type": "MANY_TO_ONE",
            "targetObjectMetadataId": target_object_id,
            "targetFieldLabel": inverse_label,
            "targetFieldIcon": "IconLink",
        },
    }


def field_plans(object_ids: dict[str, str]) -> dict[str, list[dict[str, Any]]]:
    hh = object_ids["household"]
    person = PERSON_ID
    company = COMPANY_ID
    donation = object_ids["donation"]
    fund = object_ids["fund"]
    campaign = object_ids["fundraisingCampaign"]
    pledge = object_ids["pledge"]

    return {
        "person": [
            scalar_field("lifetimeHardGiving", "Lifetime Hard Giving", "CURRENCY"),
            scalar_field("lifetimeSoftGiving", "Lifetime Soft Giving", "CURRENCY"),
            scalar_field("firstGiftDate", "First Gift Date", "DATE"),
            scalar_field("lastGiftDate", "Last Gift Date", "DATE"),
            scalar_field(
                "donorType",
                "Donor Type",
                "SELECT",
                options=select_options(
                    ["Major", "Annual", "Monthly", "Lapsed", "Prospect", "Board"]
                ),
            ),
            scalar_field(
                "preferredAcknowledgment",
                "Preferred Acknowledgment",
                "SELECT",
                options=select_options(["Email", "Mail", "Phone", "None"]),
            ),
            scalar_field("doNotSolicit", "Do Not Solicit", "BOOLEAN"),
            scalar_field("externalDonorId", "External Donor ID", "TEXT"),
        ],
        "household": [
            scalar_field("formalSalutation", "Formal Salutation", "TEXT"),
            scalar_field("mailingAddress", "Mailing Address", "ADDRESS"),
            scalar_field("lifetimeHardGiving", "Lifetime Hard Giving", "CURRENCY"),
        ],
        "householdMember": [
            relation_field("household", "Household", hh, inverse_label="Household Members"),
            relation_field("person", "Person", person, inverse_label="Household Memberships"),
            scalar_field(
                "memberRole",
                "Role",
                "SELECT",
                options=select_options(["Head", "Spouse", "Child", "Other"]),
            ),
            scalar_field("isActive", "Is Active", "BOOLEAN"),
            scalar_field(
                "receiveHouseholdSoftCredit", "Receive Household Soft Credit", "BOOLEAN"
            ),
        ],
        "donation": [
            scalar_field("amount", "Amount", "CURRENCY"),
            scalar_field("giftDate", "Gift Date", "DATE"),
            scalar_field("depositDate", "Deposit Date", "DATE"),
            scalar_field(
                "paymentMethod",
                "Payment Method",
                "SELECT",
                options=select_options(
                    [
                        "Check",
                        "Credit Card",
                        "ACH",
                        "Wire",
                        "Stock",
                        "Cash",
                        "In-Kind",
                        "Other",
                    ]
                ),
            ),
            scalar_field("checkNumber", "Check Number", "TEXT"),
            scalar_field("externalTransactionId", "External Transaction ID", "TEXT"),
            scalar_field(
                "goodsOrServicesProvided", "Goods or Services Provided", "BOOLEAN"
            ),
            scalar_field(
                "goodsOrServicesValue", "Goods or Services Value", "CURRENCY"
            ),
            scalar_field(
                "acknowledgmentStatus",
                "Acknowledgment Status",
                "SELECT",
                options=select_options(["Pending", "Sent", "Do Not Acknowledge"]),
            ),
            scalar_field(
                "tributeType",
                "Tribute Type",
                "SELECT",
                options=select_options(["In Memory", "In Honor", "None"]),
            ),
            scalar_field("tributeName", "Tribute Name", "TEXT"),
            scalar_field("statementIncluded", "Statement Included", "BOOLEAN"),
            relation_field("company", "Company", company, inverse_label="Donations"),
            relation_field(
                "fundraisingCampaign",
                "Fundraising Campaign",
                campaign,
                inverse_label="Donations",
            ),
            relation_field("fund", "Fund", fund, inverse_label="Donations"),
            relation_field("pledge", "Pledge", pledge, inverse_label="Donations"),
        ],
        "donationCredit": [
            relation_field("donation", "Donation", donation, inverse_label="Donation Credits"),
            relation_field("person", "Person", person, inverse_label="Donation Credits"),
            scalar_field(
                "creditType",
                "Credit Type",
                "SELECT",
                options=select_options(["Hard", "Soft"]),
            ),
            scalar_field(
                "creditRole",
                "Credit Role",
                "SELECT",
                options=select_options(
                    [
                        "Donor",
                        "Soft Credit",
                        "Matching Gift",
                        "Tribute Honoree",
                        "Household Member",
                    ]
                ),
            ),
            scalar_field("creditAmount", "Credit Amount", "CURRENCY"),
            scalar_field("includeInStatement", "Include In Statement", "BOOLEAN"),
            scalar_field("thanked", "Thanked", "BOOLEAN"),
        ],
        "fund": [
            scalar_field("fundCode", "Fund Code", "TEXT"),
            scalar_field("isRestricted", "Is Restricted", "BOOLEAN"),
            scalar_field(
                "restrictionType",
                "Restriction Type",
                "SELECT",
                options=select_options(
                    ["Program", "Capital", "Endowment", "General", "Unrestricted", "Other"]
                ),
            ),
            scalar_field("isActive", "Is Active", "BOOLEAN"),
        ],
        "fundraisingCampaign": [
            scalar_field("goalAmount", "Goal Amount", "CURRENCY"),
            scalar_field("startDate", "Start Date", "DATE"),
            scalar_field("endDate", "End Date", "DATE"),
            scalar_field(
                "status",
                "Status",
                "SELECT",
                options=select_options(["Planned", "Active", "Completed", "Cancelled"]),
            ),
        ],
        "pledge": [
            scalar_field("totalAmount", "Total Amount", "CURRENCY"),
            scalar_field("balance", "Balance", "CURRENCY"),
            scalar_field("startDate", "Start Date", "DATE"),
            scalar_field("endDate", "End Date", "DATE"),
            scalar_field(
                "frequency",
                "Frequency",
                "SELECT",
                options=select_options(
                    ["Monthly", "Quarterly", "Semi-Annual", "Annual", "One-Time"]
                ),
            ),
            scalar_field(
                "status",
                "Status",
                "SELECT",
                options=select_options(["Active", "Fulfilled", "Cancelled", "Delinquent"]),
            ),
            relation_field(
                "donorPerson", "Donor (Person)", person, inverse_label="Pledges"
            ),
            relation_field(
                "donorCompany", "Donor (Company)", company, inverse_label="Pledges"
            ),
            relation_field(
                "fundraisingCampaign",
                "Fundraising Campaign",
                campaign,
                inverse_label="Pledges",
            ),
            relation_field("fund", "Fund", fund, inverse_label="Pledges"),
        ],
    }


def ensure_objects(
    client: TwentyMetadataClient, objects: dict[str, dict[str, Any]]
) -> tuple[dict[str, str], list[str], list[str]]:
    ids: dict[str, str] = {}
    created: list[str] = []
    skipped: list[str] = []

    for spec in OBJECT_SPECS:
        name = spec["nameSingular"]
        if name in objects:
            ids[name] = objects[name]["id"]
            skipped.append(f"object:{name}")
            continue
        new_id = client.create_object(spec)
        ids[name] = new_id
        created.append(f"object:{name} ({new_id})")
        objects[name] = {
            "id": new_id,
            "nameSingular": name,
            "labelSingular": spec["labelSingular"],
            "fields": {},
        }

    ids["person"] = PERSON_ID
    ids["company"] = COMPANY_ID
    return ids, created, skipped


def provision_fields(
    client: TwentyMetadataClient,
    objects: dict[str, dict[str, Any]],
    object_ids: dict[str, str],
) -> tuple[list[str], list[str], list[str]]:
    created: list[str] = []
    skipped: list[str] = []
    errors: list[str] = []
    plans = field_plans(object_ids)

    for object_name, fields in plans.items():
        obj = objects.get(object_name)
        if not obj:
            errors.append(f"missing object metadata for {object_name}")
            continue
        object_id = obj["id"]
        existing = obj["fields"]
        for field in fields:
            fname = field["name"]
            key = f"{object_name}.{fname}"
            if fname in existing:
                skipped.append(key)
                continue
            try:
                client.create_field(object_id, field)
                created.append(key)
                existing[fname] = {"name": fname, "type": field["type"]}
            except RuntimeError as exc:
                errors.append(f"{key}: {exc}")
    return created, skipped, errors


def main() -> int:
    env = load_env(ENV_PATH)
    client = TwentyMetadataClient(env["TWENTY_API_URL"], env["TWENTY_API_KEY"])

    print("Fetching workspace object metadata…")
    objects = client.list_objects()

    # Bind known household id if present under expected id
    if "household" not in objects:
        for meta in objects.values():
            if meta["id"] == HOUSEHOLD_ID:
                objects["household"] = meta
                break
        else:
            try:
                data = client.gql(
                    'query { object(id: "'
                    + HOUSEHOLD_ID
                    + '") { id nameSingular labelSingular fields(paging: { first: 500 }) { edges { node { name type label } } } } }'
                )
                node = data["object"]
                if node:
                    fields = {
                        f["node"]["name"]: f["node"]
                        for f in node["fields"]["edges"]
                    }
                    objects["household"] = {
                        "id": node["id"],
                        "nameSingular": node["nameSingular"],
                        "labelSingular": node["labelSingular"],
                        "fields": fields,
                    }
            except RuntimeError:
                pass

    object_ids, created_objects, skipped_objects = ensure_objects(client, objects)

    # Refresh after creates so field maps are complete
    if created_objects:
        objects = client.list_objects()
        for spec in OBJECT_SPECS:
            name = spec["nameSingular"]
            if name in objects:
                object_ids[name] = objects[name]["id"]

    object_ids["person"] = PERSON_ID
    object_ids["company"] = COMPANY_ID
    if "household" in objects:
        object_ids["household"] = objects["household"]["id"]

    created_fields, skipped_fields, errors = provision_fields(
        client, objects, object_ids
    )

    print("\n=== Provision summary ===")
    print(f"Objects created ({len(created_objects)}):")
    for item in created_objects:
        print(f"  + {item}")
    print(f"Objects skipped ({len(skipped_objects)}):")
    for item in skipped_objects:
        print(f"  - {item}")
    print(f"Fields created ({len(created_fields)}):")
    for item in created_fields:
        print(f"  + {item}")
    print(f"Fields skipped ({len(skipped_fields)}):")
    for item in skipped_fields:
        print(f"  - {item}")
    if errors:
        print(f"Errors ({len(errors)}):")
        for item in errors:
            print(f"  ! {item}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
