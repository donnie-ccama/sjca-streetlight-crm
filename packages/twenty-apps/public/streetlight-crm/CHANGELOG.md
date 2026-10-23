# Changelog

All notable changes to this application are documented in this file.

## Unreleased

- Rebranded the application as Streetlight CRM Donor Operations and aligned
  its Twenty SDK packages with the 2.50.0 core baseline.
- Removed the tenant-specific URL and long-lived export capability from source.
  Dashboard CSV exports now use an authenticated same-origin route so the
  signed-in user's session controls access.
- Donor selection now shows a privacy-minimized mailing address directly under
  the selected name in Check, Cash Deposit, and Online Gift entry. Individual
  addresses resolve from the primary household, then an active household
  membership; organizations use their direct company address. Missing data is
  shown explicitly as "No mailing address on file."
- Added pinned **Cash Deposit** and **Online Gift** actions that open focused,
  responsive side-panel forms from anywhere in Twenty.
  - Cash entries are locked to `CASH` and require a bank-deposit date that is
    not before the received date or after today.
  - Online entries are limited to `CREDIT_CARD` or `ACH` and require a bounded
    processor transaction reference stored in a dedicated
    `donation.onlineTransactionId` field.
  - Both forms reuse the authenticated, donor-linked, idempotent Daily Giving
    write pipeline; server validation prevents a caller from changing the
    window-specific payment method.
- Daily Giving entry page: a new sidebar page ("Daily Giving") with a fast,
  batch-capable donation entry form covering every income stream recorded in
  Twenty — Check, Credit Card, ACH, Wire, Stock, Cash, In-Kind, Other.
  - Front component (`daily-donation-entry`) with donor autocomplete
    (people + organizations), fund/campaign pickers loaded live, contextual
    fields (check number for checks; description of goods for in-kind gifts),
    staged batches submitted in one click, and a running day summary by
    payment method.
  - In-kind gifts store estimated fair-market value in Amount and what was
    given in a new `donation.inKindDescription` field (added via defineField).
  - Server routes (all authenticated per signed-in user):
    `POST /s/daily-donations` creates donations + hard donor credits with
    idempotent resubmission (client entry keys stored on
    `externalTransactionId`, partial-success per row); `GET
    /s/daily-giving-context` loads funds, campaigns and the chosen day's
    entries with totals; `GET /s/daily-giving-donor-search` powers autocomplete.
  - The app-owned "Today's Gifts" table shows each individual hard-credit
    donor or organization beside the gift, with live day totals and refresh.
  - Person rollups stay fresh automatically: created hard credits trigger the
    existing `update-donor-rollup-on-credit` DB event.
- Fixed a production transport bug across the metrics layer: the generated
  `twenty-client-sdk` validates queries against an app-scoped schema at
  RUNTIME, so every logic function touching workspace-owned objects
  (`donationCredits`, `donations`, `dashboardSnapshot`, `monthlyGivingPoint`,
  custom person fields) threw `Query does not have a field …` and silently
  failed. All such calls now go through a shared `workspace-gql` raw GraphQL
  helper (with a genql-compatible serializer), restoring real-time donor
  rollups, acknowledgment generation, and the hourly dashboard refresh.
- Donor Dashboard CSV exports: each of the five dashboard record-table widgets
  now has an "Export" bar above it (YTD Snapshot, Monthly Giving Breakdown,
  Lapsed Donors, Top Donors, Acknowledgments Pending) containing a download
  link. Clicking it downloads that report's rows as a `.csv` file to the
  user's Downloads folder. Served by the `export-dashboard-report` HTTP logic
  function (`GET /donor-dashboard-export?report=<key>`),
  which queries via raw GraphQL (the app-scoped schema omits workspace custom
  objects), mirrors the filters and sorts of the dashboard views, and applies
  RFC-4180 quoting plus formula-injection neutralization. The bars are native
  rich-text widgets with static links — front-component widgets did not mount
  reliably in the original workspace. The route requires an authenticated
  Streetlight CRM session.

## 0.1.0

- Initial application scaffolded with [`create-twenty-app`](https://www.npmjs.com/package/create-twenty-app)
