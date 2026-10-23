#!/usr/bin/env python3
"""Provision dashboard support schema on Twenty via Metadata GraphQL API.

Creates (idempotently):
  - dashboardSnapshot object  (singleton KPI row, key = snapshotKey='CURRENT')
  - monthlyGivingPoint object (12 rows per year, keyed by periodLabel='YYYY-MM')
  - person.isLasted90d boolean flag (drives the Lapsed Donors view)

Prints a JSON mapping of object/field universal identifiers on the final line
so the TypeScript constants file can be kept in sync.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
API_DELAY_SEC = 0.5
USER_AGENT = "Streetlight-CRM-provision-dashboard/1.0 (Twenty Metadata API)"


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


class MetaClient:
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
                "User-Agent": USER_AGENT,
                "Accept": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                payload = json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")
            raise RuntimeError(f"HTTP {exc.code}: {detail[:400]}") from exc
        if payload.get("errors"):
            raise RuntimeError(json.dumps(payload["errors"], indent=2))
        return payload["data"]

    def list_objects(self) -> dict[str, dict[str, Any]]:
        query = """
        query Objects {
          objects(paging: { first: 500 }) {
            edges { node {
              id nameSingular universalIdentifier
              fields(paging: { first: 500 }) {
                edges { node { id name type universalIdentifier } }
              }
            } }
          }
        }
        """
        data = self.gql(query)
        out: dict[str, dict[str, Any]] = {}
        for edge in data["objects"]["edges"]:
            node = edge["node"]
            out[node["nameSingular"]] = {
                "id": node["id"],
                "universalIdentifier": node.get("universalIdentifier"),
                "fields": {f["node"]["name"]: f["node"] for f in node["fields"]["edges"]},
            }
        return out

    def create_object(self, spec: dict[str, str]) -> dict[str, Any]:
        mutation = """
        mutation CreateObject($input: CreateOneObjectInput!) {
          createOneObject(input: $input) { id nameSingular universalIdentifier }
        }
        """
        data = self.gql(
            mutation,
            {"input": {"object": {
                "nameSingular": spec["nameSingular"],
                "namePlural": spec["namePlural"],
                "labelSingular": spec["labelSingular"],
                "labelPlural": spec["labelPlural"],
                "icon": spec.get("icon", "IconBox"),
                "description": spec.get("description"),
            }}},
        )
        return data["createOneObject"]

    def create_field(self, object_id: str, field: dict[str, Any]) -> dict[str, Any]:
        mutation = """
        mutation CreateField($input: CreateOneFieldMetadataInput!) {
          createOneField(input: $input) { id name type universalIdentifier }
        }
        """
        payload = dict(field)
        payload["objectMetadataId"] = object_id
        data = self.gql(mutation, {"input": {"field": payload}})
        return data["createOneField"]


def scalar(name: str, label: str, ftype: str, **kw: Any) -> dict[str, Any]:
    f: dict[str, Any] = {"type": ftype, "name": name, "label": label}
    f.update(kw)
    return f


OBJECT_SPECS = [
    {
        "nameSingular": "dashboardSnapshot",
        "namePlural": "dashboardSnapshots",
        "labelSingular": "Dashboard Snapshot",
        "labelPlural": "Dashboard Snapshots",
        "icon": "IconGauge",
        "description": "Hourly-computed KPI snapshot powering the Donor Dashboard",
    },
    {
        "nameSingular": "monthlyGivingPoint",
        "namePlural": "monthlyGivingPoints",
        "labelSingular": "Monthly Giving",
        "labelPlural": "Monthly Giving Points",
        "icon": "IconChartBar",
        "description": "Per-month giving totals powering the Donor Dashboard breakdown",
    },
]

FIELD_SPECS: dict[str, list[dict[str, Any]]] = {
    "dashboardSnapshot": [
        scalar("snapshotKey", "Snapshot Key", "TEXT", description="Always CURRENT for the live row"),
        scalar("computedAt", "Computed At", "DATE_TIME"),
        scalar("ytdDonors", "YTD Donors", "NUMBER", description="Unique donors incl. companies"),
        scalar("individualDonorsYtd", "Individual Donors YTD", "NUMBER"),
        scalar("companyDonorsYtd", "Company Donors YTD", "NUMBER"),
        scalar("activeDonors90d", "Active Donors (90d)", "NUMBER"),
        scalar("lapsedDonorCount", "Lapsed Donors", "NUMBER"),
        scalar("ytdGiving", "YTD Giving", "CURRENCY"),
        scalar("avgGift", "Average Gift", "CURRENCY"),
    ],
    "monthlyGivingPoint": [
        scalar("periodLabel", "Period", "TEXT", description="YYYY-MM"),
        scalar("sortKey", "Sort Key", "NUMBER", description="YYYYMM integer for ordering"),
        scalar("totalAmount", "Total Amount", "CURRENCY"),
        scalar("giftCount", "Gifts", "NUMBER"),
        scalar("donorCount", "Donors", "NUMBER"),
    ],
}

PERSON_LAPSED_FIELD = scalar(
    "isLapsed90d",
    "Lapsed (90d)",
    "BOOLEAN",
    description="No hard-credit gift in the last 90 days (maintained hourly)",
)


def main() -> int:
    env = load_env(ENV_PATH)
    client = MetaClient(env["TWENTY_API_URL"], env["TWENTY_API_KEY"])

    print("Fetching workspace metadata…")
    objects = client.list_objects()

    result: dict[str, Any] = {"objects": {}, "fields": {}}
    errors: list[str] = []

    # --- objects -------------------------------------------------------
    for spec in OBJECT_SPECS:
        name = spec["nameSingular"]
        if name in objects:
            result["objects"][name] = objects[name].get("universalIdentifier") or objects[name]["id"]
            print(f"  = object {name} exists ({objects[name]['id']})")
        else:
            created = client.create_object(spec)
            result["objects"][name] = created.get("universalIdentifier") or created["id"]
            print(f"  + object {name} created ({created['id']})")
            objects[name] = {
                "id": created["id"],
                "universalIdentifier": created.get("universalIdentifier"),
                "fields": {},
            }

    # --- fields on new objects ----------------------------------------
    for obj_name, fields in FIELD_SPECS.items():
        obj = objects[obj_name]
        for field in fields:
            fname = field["name"]
            if fname in obj["fields"]:
                node = obj["fields"][fname]
                result["fields"][f"{obj_name}.{fname}"] = (
                    node.get("universalIdentifier") or node["id"]
                )
                continue
            try:
                created = client.create_field(obj["id"], field)
                uid = created.get("universalIdentifier") or created["id"]
                result["fields"][f"{obj_name}.{fname}"] = uid
                obj["fields"][fname] = {"id": created["id"], "universalIdentifier": created.get("universalIdentifier")}
                print(f"  + field {obj_name}.{fname} created")
            except RuntimeError as exc:
                errors.append(f"{obj_name}.{fname}: {exc}")

    # --- person.isLapsed90d --------------------------------------------
    person = objects.get("person")
    if person and "isLapsed90d" not in person["fields"]:
        try:
            created = client.create_field(person["id"], PERSON_LAPSED_FIELD)
            uid = created.get("universalIdentifier") or created["id"]
            result["fields"]["person.isLapsed90d"] = uid
            print(f"  + field person.isLapsed90d created")
        except RuntimeError as exc:
            errors.append(f"person.isLapsed90d: {exc}")
    elif person:
        node = person["fields"]["isLapsed90d"]
        result["fields"]["person.isLapsed90d"] = node.get("universalIdentifier") or node["id"]
        print("  = field person.isLapsed90d exists")

    # Refresh once so existing-object field UIDs are complete in output
    if errors:
        objects = client.list_objects()
        for key in list(result["fields"]):
            obj_name, fname = key.split(".", 1)
            node = objects.get(obj_name, {}).get("fields", {}).get(fname)
            if node:
                result["fields"][key] = node.get("universalIdentifier") or node["id"]

    print("\n=== Provision summary ===")
    if errors:
        print(f"Errors ({len(errors)}):")
        for e in errors:
            print(f"  ! {e}")
    print("IDENTIFIERS_JSON_BEGIN")
    print(json.dumps(result, indent=2))
    print("IDENTIFIERS_JSON_END")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
