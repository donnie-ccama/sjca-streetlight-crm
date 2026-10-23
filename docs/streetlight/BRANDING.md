# Streetlight CRM design package

The repository-local `streetlight-crm-logo-package/` is the visual source of
truth for the CRM identity:

- `svg/` contains the Lamppost logo, full CRM lockups, marks, and app icon.
- `favicon/` contains the browser, Apple touch, and installable app assets.
- `png/` contains the social link preview and non-SVG exports.
- `design/streetlight-crm-tokens.css` defines the approved tokens and component
  examples.

The integration maps those values into Twenty's explicit `.light` and `.dark`
theme scopes instead of importing the package stylesheet verbatim. This keeps
Twenty's 13px operational scale and manual theme selection intact. The CRM uses
Inter for dense UI and Inter Tight 700 for semantic headings when available.

The desktop drawer and mobile navigation surface use Lamppost Navy `#1b2b4b`,
the white CRM logo, white active text, and `#c9d1e3` inactive text. Full logos
must remain at least 140px wide; compact spaces use the package app icon.
Filament Red is reserved for the dominant primary action, while blue remains
available for focus and informational semantics. Package status colors remain
distinct from brand emphasis.

The favicon, Apple touch icon, 192px and 512px PWA icons, and link preview are
copied byte-for-byte from the package. The supplied rounded icons are declared
for `purpose: "any"`, not `maskable`.

Product copy uses **Streetlight CRM**. Technical Twenty identifiers and
attribution remain unchanged, and public or commercial distribution must follow
`LICENSING_AND_MARKETING.md`.
