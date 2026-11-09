# App development

## Prerequisites

- Node.js and Yarn versions declared by the repository root.
- A running local Streetlight CRM server.
- A local API key used only for application plan/apply operations.

## Install and verify

From this directory:

```bash
yarn install --immutable
yarn lint
yarn typecheck
yarn test:unit
```

Copy `.env.example` to `.env`, create a local-only API key in the development
workspace, and then run:

```bash
yarn twenty plan
yarn twenty apply
yarn twenty dev
```

Export the two variables from that ignored file before running integration
tests with `yarn test`. Never commit `.env`, API keys, customer exports, or
generated `.twenty` output. Integration tests require a disposable local
workspace and synthetic records; unit tests do not contact a server.

# Social landing pages

Do these steps once for each workspace. Apply the app first (`yarn twenty plan -r <remote>`, then `yarn twenty apply -r <remote>`).

## 1. Address for public pages

Pick a host such as `give.<your-domain>`. It must reach the CRM server.

1. Add a Cloudflare Tunnel public hostname for `give.<your-domain>`. Point it at the same service as the CRM host.
2. Add a DNS record for it. Create it from the tunnel route, or add it by hand:

```text
give.<your-domain> CNAME <tunnel-id>.cfargotunnel.com (proxied)
```

Citykid example: `give.citykid.me CNAME <tunnel-id>.cfargotunnel.com`.

## 2. Short address rewrite

Public routes live under `/s/lp/<slug>`. A short link needs a Cloudflare URL rewrite rule on the same host:

- When: host is `give.<your-domain>`, method is `GET`, path matches `/<slug>` (one segment, not starting with `/s/`).
- Then: rewrite the path to `/s/lp/<slug>`.

The form and tracking posts already go to `/s/lp/...`, so only `GET` needs the rule.

The server finds the workspace from the request host. On a self-hosted server with `IS_MULTIWORKSPACE_ENABLED=false` (one workspace), any host reaches it, so `give.<your-domain>` works as set up above. On a multi-workspace server, `give.<your-domain>` finds no workspace: use the workspace subdomain or a custom domain set on the workspace instead.

## 3. Origin access

The app reads the visitor address from `cf-connecting-ip`. Anyone who can reach the server without Cloudflare can fake that header and skip the rate limit. Keep the origin reachable only through the tunnel. Publish no server port to the internet.

## 4. Application variables

Set these in Settings > Apps > Streetlight CRM > Variables. Secret values are hidden after you save them.

| Name | Secret | What it does |
|---|---|---|
| `LANDING_PAGE_BASE_URL` | No | Public base address, for example `https://give.<your-domain>`. Post links use it. Publishing fails while it is empty. |
| `TURNSTILE_SITE_KEY` | No | Turnstile site key shown on page forms. |
| `TURNSTILE_SECRET_KEY` | Yes | Turnstile secret key. Required: until it is set, no form, visit, or give click is saved. Also keys the address hash used for the rate limit. |
| `STRIPE_SECRET_KEY` | Yes | Stripe restricted key. Give buttons show only when this and `STRIPE_WEBHOOK_SECRET` are both set. |
| `STRIPE_WEBHOOK_SECRET` | Yes | Signing secret (`whsec_`) of the Stripe webhook endpoint. |
| `GIVING_CONTACT_EMAIL` | No | Address that receives giving questions. Empty hides the question link on the give panel. |
| `POSTIZ_API_KEY` | Yes | Postiz Cloud API key. Publishes approved posts. Empty means an approved post stays APPROVED for hand posting. |
| `RESEND_API_KEY` | Yes | Sends the volunteer follow-up email. |
| `VOLUNTEER_EMAIL_FROM` | No | From address of the volunteer email. Its domain must be verified in Resend. |
| `VOLUNTEER_EMAIL_SUBJECT` | No | Subject of the volunteer email. |
| `VOLUNTEER_EMAIL_BODY` | No | Body of the volunteer email. |
| `LANDING_PAGE_BRAND_COLOR` | No | Accent color on pages, for example `#1a1a1a`. Empty means neutral gray. |
| `LANDING_PAGE_ORGANIZATION_NAME` | No | Organization name shown on pages. |
| `LANDING_PAGE_TAGLINE` | No | Short line under the organization name in the page footer. |
| `LANDING_PAGE_MAILING_ADDRESS` | No | Mailing address shown in the page footer. |
| `LANDING_PAGE_LOGO_URL` | No | Public `https` address of the logo shown in the page header. |
| `LANDING_PAGE_SITE_URL` | No | `https` address of the main website. The header links to it. |
| `GIFT_DATE_TIME_ZONE` | No | IANA time zone for the date of Stripe gifts, for example `America/New_York`. Empty or an unknown name means UTC. |

## 5. Turnstile

1. In the Cloudflare dashboard, open Turnstile and add a site.
2. Add `give.<your-domain>` as its domain.
3. Copy the site key into `TURNSTILE_SITE_KEY` and the secret key into `TURNSTILE_SECRET_KEY`.

## 6. Stripe

1. Make a restricted key in the Stripe Dashboard. Put it in `STRIPE_SECRET_KEY`. Give it this access:
   - Write: Checkout Sessions, Customers, Subscriptions, Prices, Products.
   - Read: Events, Charges, Invoices, Payment Intents, Balance Transactions.
2. Add a webhook endpoint at `{LANDING_PAGE_BASE_URL}/s/stripe/webhook`. Set its API version to `2025-08-27.basil`. Select these events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`. Do not select `payment_intent.succeeded`. The hourly job reads those payments. Put the signing secret of the endpoint in `STRIPE_WEBHOOK_SECRET`.
3. Turn on email receipts for paid payments and for subscriptions.
4. Turn on the customer portal with "cancel" and "update payment method". Turn on the link to the portal in subscription emails.
5. Turn on the emails for failed card charges and for cards that expire soon.

A Stripe gift with no email address imports with no Person. Staff match it to a Person by hand.

The import has these rules:
- A gift in a currency other than USD is skipped. Enter it by hand.
- A gift you delete in the CRM stays deleted. The import does not create it again.
- The import starts at the first Stripe event the CRM gets. Earlier gifts are not doubled.

Switch day: do these steps in the same hour as the deploy.

1. Put in the Stripe keys.
2. Create the webhook.
3. Turn off the FundraiseUp forms.

FundraiseUp charges the same Stripe account. Both tools take gifts from the same donors until you turn it off. The import does not get gifts from the time between the deploy and these steps. Enter those gifts by hand.

## 7. Postiz

1. Create a Postiz Cloud account.
2. Connect one Facebook Page, one Instagram account, one TikTok account, and one YouTube channel in Postiz.
3. In Postiz Settings, copy the API key. Put it in `POSTIZ_API_KEY`.

At each publish, the app finds the connected channel for each network. Two connected channels of one network stop the post.

The app sends these settings:
- Facebook: a normal Page post.
- Instagram: a feed post.
- YouTube: a public video with the post name as its title, not made for kids.
- TikTok: a public video that posts at once. Comments are on. Duets and stitches are off.

PUBLISHED means that Postiz accepted the post. Postiz then posts to each network. A network that rejects the post shows the error in Postiz.

Postiz has no guard against a second send. If a send stops before Postiz answers, check Postiz, then approve the post again.

## 8. Resend sender domain

1. In Resend, add and verify the sender domain.
2. Set `VOLUNTEER_EMAIL_FROM` to an address on that domain.
3. Put the Resend API key in `RESEND_API_KEY`.
4. Write the subject and body in `VOLUNTEER_EMAIL_SUBJECT` and `VOLUNTEER_EMAIL_BODY`.

## 9. API key for AI agents

1. Open Settings > API keys and create a key.
2. Assign it the `Social Post Agent` role.
3. Give the key to the agent tool.

This role can read and edit Landing Pages and Social Posts only. On a Social Post it cannot change `status`, `approvedBy`, `approvedAt`, or `publishResult`. On a Landing Page it cannot change `status`, `giveAmounts`, `fund`, or `fundraisingCampaign`, so agents create DRAFT pages. A person sets the gift amounts, the fund, and the campaign, and makes the page LIVE. A person approves from the CRM with the Approve and Publish command. The agent steps are in `skills/social-landing-campaign.md`.

## 10. Prayer list

1. Create a message list for prayer requests.
2. On each Landing Page, pick it in the Prayer List field.

Pray adds people to that list.

## 11. Page builder

Each Landing Page has a Builder tab. Use it to build the page from sections.

1. Open a Landing Page and select the Builder tab.
2. Add, reorder, hide, and edit sections. A new page starts with starter sections.
3. The builder saves your edits as a draft about 2 seconds after the last change. The Save button saves at once. Drafts never reach the public page.
4. Select Draft or Published above the preview to see either copy.
5. Select Publish to copy the visible sections to the public page. Only signed-in people can publish. Agents cannot.

Pages that existed before the builder moved to sections on upgrade. Their hero photos are not moved. Upload each hero photo again in the builder, then Publish.

Publishing copies each photo. The app role needs the Upload File permission. It ships with it, so no setup is needed.
