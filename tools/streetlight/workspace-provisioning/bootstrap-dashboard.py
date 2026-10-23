#!/usr/bin/env python3
"""One-time bootstrap of Donor Dashboard rows via Twenty core GraphQL.

Computes the same metrics as refresh-donor-dashboard (which runs hourly) and
writes:
  - dashboardSnapshot singleton (snapshotKey=CURRENT)
  - monthlyGivingPoint rows for the current year
  - person.isLapsed90d SELECT flags (TRUE/FALSE) where they differ

Read-only against Aplos-free sources: everything comes from Twenty itself.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
DELAY = 0.35
UA = "Streetlight-CRM-bootstrap-dashboard/1.0"


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip()
    if not env.get("TWENTY_API_URL") or not env.get("TWENTY_API_KEY"):
        raise SystemExit(f"Missing TWENTY_* vars in {path}")
    return env


ENV = load_env(ENV_PATH)
URL = ENV["TWENTY_API_URL"].rstrip("/") + "/graphql"
KEY = ENV["TWENTY_API_KEY"]


def gql(query: str, variables: dict | None = None) -> dict:
    time.sleep(DELAY)
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(
        URL,
        data=body,
        headers={
            "Authorization": f"Bearer {KEY}",
            "Content-Type": "application/json",
            "User-Agent": UA,
            "Accept": "application/json",
        },
    )
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                payload = json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")
            raise RuntimeError(f"HTTP {exc.code}: {detail[:300]}") from exc
        except OSError as exc:
            if attempt < 3:
                time.sleep(2**attempt)
                continue
            raise RuntimeError(f"transport: {exc}") from exc
        if payload.get("errors"):
            raise RuntimeError(json.dumps(payload["errors"])[:400])
        return payload["data"]
    raise RuntimeError("retries exhausted")


def page_all(root_key: str, selection: str, extra_args: str = "") -> list[dict]:
    rows: list[dict] = []
    after: str | None = None
    while True:
        args = f"first:200{', after:' + json.dumps(after) if after else ''}{',' + extra_args if extra_args else ''}"
        q = f"query {{ {root_key}({args}) {{ edges {{ node {{ {selection} }} cursor }} pageInfo {{ hasNextPage endCursor }} }} }}"
        conn = gql(q)[root_key]
        rows.extend(e["node"] for e in conn.get("edges", []))
        pi = conn.get("pageInfo", {})
        if not pi.get("hasNextPage"):
            break
        after = pi.get("endCursor")
        if not after:
            break
    return rows


def money(micros: int) -> dict:
    return {"amountMicros": str(micros), "currencyCode": "USD"}


def main() -> int:
    year = datetime.now().year
    cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).date().isoformat()
    print(f"YTD={year}-01-01..now  lapsed-cutoff={cutoff}")

    print("Fetching donations…")
    donations = page_all(
        "donations",
        "id amount { amountMicros } giftDate company { id } donationCredits { edges { node { person { id } } } }",
        f'filter: {{ giftDate: {{ gte: "{year}-01-01" }} }}',
    )
    print(f"  donations: {len(donations)}")

    print("Fetching people…")
    people = page_all(
        "people",
        "id isLapsed90d lastGiftDate",
    )
    print(f"  people: {len(people)}")

    indiv, comp, active = set(), set(), set()
    months: dict[str, dict] = {}
    total = 0
    gift_count = 0

    for d in donations:
        micros = int((d.get("amount") or {}).get("amountMicros") or 0)
        total += micros
        gift_count += 1
        persons = [
            e["node"]["person"]["id"]
            for e in (d.get("donationCredits") or {}).get("edges", [])
            if e.get("node", {}).get("person", {}).get("id")
        ]
        company_id = (d.get("company") or {}).get("id")
        indiv.update(persons)
        if company_id:
            comp.add(company_id)
        ym = (d.get("giftDate") or "")[:7]
        if ym:
            m = months.setdefault(ym, {"micros": 0, "gifts": 0, "donors": set()})
            m["micros"] += micros
            m["gifts"] += 1
            m["donors"].update(persons)
            if company_id:
                m["donors"].add("c:" + company_id)
        gd = d.get("giftDate") or ""
        if gd and gd >= cutoff:
            active.update(persons)
            if company_id:
                active.add("c:" + company_id)

    avg = total // max(len(donations), 1)
    lapsed_count = sum(
        1 for p in people if (p.get("lastGiftDate") or "") and p["lastGiftDate"] < cutoff
    )

    # ── Upsert snapshot ────────────────────────────────────────────────
    snap_data = {
        "computedAt": datetime.now(timezone.utc).isoformat(),
        "ytdDonors": len(indiv) + len(comp),
        "individualDonorsYtd": len(indiv),
        "companyDonorsYtd": len(comp),
        "activeDonors90d": len(active),
        "lapsedDonorCount": lapsed_count,
        "ytdGiving": money(total),
        "avgGift": money(avg),
    }
    found = gql(
        'query { dashboardSnapshots(first:1, filter:{snapshotKey:{eq:"CURRENT"}}) { edges { node { id } } } }'
    )["dashboardSnapshots"]["edges"]
    if found:
        sid = found[0]["node"]["id"]
        gql(
            "mutation($id: UUID!, $data: DashboardSnapshotUpdateInput!) { updateDashboardSnapshot(id:$id, data:$data) { id } }",
            {"id": sid, "data": snap_data},
        )
        print(f"snapshot updated ({sid})")
    else:
        gql(
            "mutation($data: DashboardSnapshotCreateInput!) { createDashboardSnapshot(data:$data) { id } }",
            {"data": {**snap_data, "snapshotKey": "CURRENT"}},
        )
        print("snapshot created")

    # ── Upsert monthly rows ────────────────────────────────────────────
    existing_months = {
        e["node"]["periodLabel"]: e["node"]["id"]
        for e in gql(
            "query { monthlyGivingPoints(first:60){ edges { node { id periodLabel } } } }"
        )["monthlyGivingPoints"]["edges"]
    }
    for mnum in range(1, 13):
        ym = f"{year}-{mnum:02d}"
        agg = months.get(ym)
        row = {
            "sortKey": year * 100 + mnum,
            "totalAmount": money(agg["micros"] if agg else 0),
            "giftCount": agg["gifts"] if agg else 0,
            "donorCount": len(agg["donors"]) if agg else 0,
        }
        if ym in existing_months:
            gql(
                "mutation($id: UUID!, $data: MonthlyGivingPointUpdateInput!) { updateMonthlyGivingPoint(id:$id, data:$data) { id } }",
                {"id": existing_months[ym], "data": row},
            )
        else:
            gql(
                "mutation($data: MonthlyGivingPointCreateInput!) { createMonthlyGivingPoint(data:$data) { id } }",
                {"data": {**row, "periodLabel": ym}},
            )
    print(f"monthly rows written: 12")

    # ── Patch lapsed flags (diff-only) ─────────────────────────────────
    diffs = []
    for p in people:
        lg = p.get("lastGiftDate") or ""
        desired = "TRUE" if (lg and lg < cutoff) else "FALSE"
        if p.get("isLapsed90d") != desired:
            diffs.append((p["id"], desired))
    print(f"flag diffs to patch: {len(diffs)}")

    def patch(item):
        pid, desired = item
        gql(
            "mutation($id: UUID!, $data: PersonUpdateInput!) { updatePerson(id:$id, data:$data) { id } }",
            {"id": pid, "data": {"isLapsed90d": desired}},
        )

    done = 0
    with ThreadPoolExecutor(max_workers=4) as pool:
        for _ in pool.map(patch, diffs):
            done += 1
            if done % 100 == 0:
                print(f"  …{done}/{len(diffs)}")

    print("\n=== Bootstrap complete ===")
    print(json.dumps({
        "ytdDonors": len(indiv) + len(comp),
        "individualDonorsYtd": len(indiv),
        "companyDonorsYtd": len(comp),
        "activeDonors90d": len(active),
        "lapsedDonors": lapsed_count,
        "ytdGivingUSD": round(total / 1e6, 2),
        "avgGiftUSD": round(avg / 1e6, 2),
        "flagsPatched": len(diffs),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
