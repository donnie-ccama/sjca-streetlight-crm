"""Twenty CRM client — Metadata GraphQL (/metadata) + core REST data API (/rest).

A custom User-Agent is mandatory: Cloudflare bans the default urllib UA with a 1010.
Records are upserted on their external key (never blind-created).
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from .env import load_env, require

USER_AGENT = "Streetlight-CRM-aplos-migration/1.0 (Twenty API)"
API_DELAY_SEC = 0.6  # < 100 req/min


class TwentyError(RuntimeError):
    pass


class TwentyClient:
    def __init__(self, env: dict[str, str] | None = None) -> None:
        env = env or load_env()
        require(env, "TWENTY_API_URL", "TWENTY_API_KEY")
        self.api_url = env["TWENTY_API_URL"].rstrip("/")
        self.api_key = env["TWENTY_API_KEY"]

    # ---- low-level HTTP --------------------------------------------------

    def _request(self, method: str, url: str, body: Any | None = None) -> Any:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(
            url,
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": USER_AGENT,
            },
        )
        for attempt in range(5):
            time.sleep(API_DELAY_SEC)
            try:
                # timeout guards against hung connections (a stalled socket with no
                # timeout blocks forever); on timeout urlopen raises TimeoutError (OSError).
                with urllib.request.urlopen(req, timeout=60) as resp:
                    raw = resp.read().decode()
                    return json.loads(raw) if raw else {}
            except urllib.error.HTTPError as exc:
                if exc.code in (429, 500, 502, 503, 504) and attempt < 4:
                    time.sleep(2 ** attempt)  # 1, 2, 4, 8s backoff
                    continue
                detail = exc.read().decode(errors="replace")
                raise TwentyError(
                    f"{method} {url} -> HTTP {exc.code}: {detail[:500]}"
                ) from exc
            except OSError as exc:
                # OSError covers URLError, ConnectionResetError, TimeoutError, and other
                # socket faults — all transient; retry with backoff before giving up.
                if attempt < 4:
                    time.sleep(2 ** attempt)
                    continue
                raise TwentyError(f"{method} {url} -> {exc}") from exc
        raise TwentyError(f"{method} {url} -> exhausted retries")

    # ---- metadata (GraphQL) ---------------------------------------------

    def gql(self, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        payload = self._request(
            "POST", f"{self.api_url}/metadata", {"query": query, "variables": variables or {}}
        )
        if payload.get("errors"):
            raise TwentyError(json.dumps(payload["errors"], indent=2))
        return payload["data"]

    def list_objects(self) -> dict[str, dict[str, Any]]:
        query = """
        query Objects {
          objects(paging: { first: 500 }) {
            edges { node {
              id nameSingular namePlural labelSingular
              fields(paging: { first: 500 }) { edges { node { id name type } } }
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
                "nameSingular": node["nameSingular"],
                "namePlural": node["namePlural"],
                "fields": {f["node"]["name"]: f["node"] for f in node["fields"]["edges"]},
            }
        return out

    def create_field(self, object_id: str, field: dict[str, Any]) -> dict[str, Any]:
        mutation = """
        mutation CreateField($input: CreateOneFieldMetadataInput!) {
          createOneField(input: $input) { id name type }
        }
        """
        payload = dict(field)
        payload["objectMetadataId"] = object_id
        payload.setdefault("isCustom", True)
        return self.gql(mutation, {"input": {"field": payload}})["createOneField"]

    # ---- core data (REST) ------------------------------------------------

    def rest_get(self, object_plural: str, params: dict[str, Any] | None = None) -> list[dict]:
        url = f"{self.api_url}/rest/{object_plural}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        payload = self._request("GET", url)
        data = payload.get("data", payload)
        if isinstance(data, dict):
            recs = data.get(object_plural)
            if isinstance(recs, list):
                return recs
            return next((v for v in data.values() if isinstance(v, list)), [])
        return data if isinstance(data, list) else []

    def rest_page(self, object_plural: str, params: dict[str, Any] | None = None) -> tuple[list[dict], dict]:
        """Fetch one page; return (records, pageInfo). pageInfo has endCursor/hasNextPage."""
        url = f"{self.api_url}/rest/{object_plural}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        payload = self._request("GET", url)
        data = payload.get("data", payload) if isinstance(payload, dict) else payload
        if isinstance(data, dict):
            recs = data.get(object_plural)
            if not isinstance(recs, list):
                recs = next((v for v in data.values() if isinstance(v, list)), [])
        else:
            recs = data if isinstance(data, list) else []
        page_info = payload.get("pageInfo", {}) if isinstance(payload, dict) else {}
        return recs, (page_info or {})

    def rest_get_all(self, object_plural: str, page_size: int = 60,
                     extra_params: dict[str, Any] | None = None) -> list[dict]:
        """Cursor-paginate through ALL records.

        Twenty's REST API IGNORES `offset` (it silently returns the first page every
        time → infinite loop). Pagination is cursor-based: advance `starting_after`
        with `pageInfo.endCursor` until `hasNextPage` is false.
        """
        out: list[dict] = []
        after: str | None = None
        while True:
            params = dict(extra_params or {})
            params["limit"] = page_size
            if after:
                params["starting_after"] = after
            recs, page_info = self.rest_page(object_plural, params)
            out.extend(recs)
            if not recs or not page_info.get("hasNextPage"):
                break
            after = page_info.get("endCursor")
            if not after:
                break
        return out

    def find_by(self, object_plural: str, field: str, value: str) -> dict | None:
        """Look up a single record by an exact field match (idempotency key)."""
        recs = self.rest_get(object_plural, {"filter": f"{field}[eq]:{value}", "limit": 1})
        return recs[0] if recs else None

    def create(self, object_plural: str, payload: dict) -> dict:
        res = self._request("POST", f"{self.api_url}/rest/{object_plural}", payload)
        data = res.get("data", res)
        # REST wraps the created record under a singular-ish key; return it raw if unknown.
        if isinstance(data, dict) and len(data) == 1:
            return next(iter(data.values()))
        return data

    def update(self, object_plural: str, record_id: str, payload: dict) -> dict:
        res = self._request(
            "PATCH", f"{self.api_url}/rest/{object_plural}/{record_id}", payload
        )
        data = res.get("data", res)
        if isinstance(data, dict) and len(data) == 1:
            return next(iter(data.values()))
        return data

    def upsert(self, object_plural: str, key_field: str, key_value: str, payload: dict) -> tuple[str, str]:
        """Find by key; update if present else create. Returns (record_id, 'created'|'updated')."""
        existing = self.find_by(object_plural, key_field, key_value)
        if existing:
            rec = self.update(object_plural, existing["id"], payload)
            return rec.get("id", existing["id"]), "updated"
        rec = self.create(object_plural, {**payload, key_field: key_value})
        return rec["id"], "created"
