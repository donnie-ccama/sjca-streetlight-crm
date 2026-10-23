#!/usr/bin/env python3
"""Read-only introspection of Streetlight donor objects in Twenty.

Queries the /metadata GraphQL endpoint for the universal identifiers and fields
of the donor-domain objects. Prints a JSON map keyed by object nameSingular.
Does NOT read donor records — metadata only.

Usage: python3 scripts/introspect-workspace.py
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
DONOR_OBJECTS = {
    "household",
    "householdMember",
    "donation",
    "donationCredit",
    "fund",
    "fundraisingCampaign",
    "pledge",
    "person",  # standard object — check which donor extension fields exist
}


def load_env(path: Path) -> dict[str, str]:
    if not path.is_file():
        sys.exit(f"Missing env file: {path}")
    env: dict[str, str] = {}
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


def gql(endpoint: str, api_key: str, query: str) -> dict:
    body = json.dumps({"query": query}).encode()
    req = urllib.request.Request(
        endpoint,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "User-Agent": "Streetlight-CRM-introspect-workspace/1.0 (Twenty Metadata API)",
            "Accept": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.loads(resp.read().decode())
    if payload.get("errors"):
        raise RuntimeError(json.dumps(payload["errors"], indent=2))
    return payload["data"]


def main() -> int:
    env = load_env(ENV_PATH)
    endpoint = f"{env['TWENTY_API_URL'].rstrip('/')}/metadata"

    query = """
    query ListObjects {
      objects(paging: { first: 500 }) {
        edges {
          node {
            id
            nameSingular
            labelSingular
            fields(paging: { first: 500 }) {
              edges {
                node {
                  id
                  name
                  type
                  label
                }
              }
            }
          }
        }
      }
    }
    """

    data = gql(endpoint, env["TWENTY_API_KEY"], query)

    out: dict[str, dict] = {}
    for edge in data["objects"]["edges"]:
        node = edge["node"]
        name = node["nameSingular"]
        if name not in DONOR_OBJECTS:
            continue
        fields = [
            {"id": f["node"]["id"], "name": f["node"]["name"],
             "type": f["node"]["type"], "label": f["node"]["label"]}
            for f in node["fields"]["edges"]
        ]
        out[name] = {
            "id": node["id"],
            "labelSingular": node["labelSingular"],
            "fields": fields,
        }

    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
