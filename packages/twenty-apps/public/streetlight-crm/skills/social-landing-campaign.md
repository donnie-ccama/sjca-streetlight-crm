# Social landing campaign

Use this to prepare a social post and its landing page for approval. You prepare. A person approves and publishes.

## Rules

- Never set `status`, `approvedBy`, `approvedAt`, or `publishResult` on a Social Post. Your role cannot write them.
- Create every Landing Page as DRAFT. Never set its `status`, `giveAmounts`, `fund`, or `fundraisingCampaign`. Your role cannot write them. A person sets the gift amounts, fund, and campaign, and makes the page LIVE.
- Never publish. Never set `publishedContent`, `publishedPhotos`, `publishedAt`, or `publishedBy` on a Landing Page. Only a person publishes, from the builder.
- Never change button actions or button URLs on a section. Your role cannot write them.
- Create every Social Post with `status` DRAFT and `readyForReview` true.
- Do not type tracking links. The app builds each network link from the post `slug`.
- Do not publish or post anywhere yourself.

## Objects

### Landing Page (`landingPage`)

| Field | Use |
|---|---|
| `name` | Label in the CRM |
| `slug` | Public path, unique, lowercase with hyphens |
| `status` | DRAFT, LIVE, or ARCHIVED. Only LIVE pages are public. Leave it out. A new page is DRAFT, and a person sets it. |
| `headline`, `body` | `headline` is the page title. `body` does not show. The public page shows sections only. A new title or share text reaches the public page only after a person publishes. |
| `heroImage` | Main photo (file) |
| `giveLabel`, `prayLabel`, `volunteerLabel` | Button words. Empty hides that button. |
| `giveAmounts`, `fund`, `fundraisingCampaign` | Gift amounts and where gifts go. Leave them out. A person sets them. |
| `prayerList` | Message list that Pray adds people to |
| `volunteerFollowUpUrl` | Link in the volunteer email |

### Landing Page Section (`landingPageSection`)

A section is part of the draft of any page. Edit sections to change the page text. Edits reach the public page only after a person publishes. Do not publish them yourself.

| Field | Use |
|---|---|
| `landingPage` | The page the section belongs to |
| `sectionType` | HERO, STATS, STORY, GIVE, QUOTE, JOIN, or VOLUNTEER. The field is `sectionType`, not `type`. |
| `position` | Order on the page. A number, lowest first. |
| `isVisible` | False hides the section from the next publish |
| `eyebrow`, `heading`, `text` | Section text. In a heading, `*stars*` shows in the accent color. |
| `trustLine`, `badgeValue`, `badgeText` | HERO only |
| `smallPrint` | GIVE only |
| `items` | JSON list. Shape depends on the type. |

Items by type:

- STATS (up to 4): `[{"value": "1,200", "label": "meals a week"}]`
- STORY (up to 3): `[{"title": "...", "text": "..."}]`
- GIVE (up to 6): `[{"amount": "$25", "title": "...", "text": "...", "featured": false}]`
- Other types take no items.

JOIN and VOLUNTEER may appear once per page. Photos need a person to upload them.

### Social Post (`socialPost`)

| Field | Use |
|---|---|
| `name` | Label in the CRM |
| `slug` | Unique. Becomes `utm_campaign`. |
| `landingPage` | The page this post sends people to |
| `media` | One photo or video (file) |
| `captionFacebook`, `captionInstagram`, `captionTiktok`, `captionYoutube` | One caption per network. Empty skips that network. |
| `scheduledAt` | Empty means publish on approval |
| `status` | Leave as DRAFT |
| `readyForReview` | Set true when the post is complete |

## Steps

1. Find a Landing Page that fits (match by `name` or `slug`). If none fits, create one with the fields above, without `status`, `giveAmounts`, `fund`, or `fundraisingCampaign`. Reuse an existing page rather than making a near copy.
2. Upload the photo or video to the post `media` field. Use `heroImage` on the page only if the page has none.
3. Create the Social Post with `landingPage`, a unique `slug`, the four captions, `status` DRAFT, and `readyForReview` true. Write each caption for its network. Leave a caption empty to skip a network.
4. Return the CRM link to the Social Post. Say that a person must open it and choose Approve and Publish. If you created a Landing Page, say that a person must set its gift amounts, fund, and campaign and make it LIVE first.

## After you finish

People find the post in the Ready for Review view (Social Posts, DRAFT and `readyForReview` true). Do not edit a post after setting `readyForReview` unless asked.

## Responses

The agent role cannot read Response records. If a person gives you broader access, the event field is `responseType` (VISIT, GIVE_CLICK, PRAY, VOLUNTEER, GIFT), not `type`.
