# Streetlight CRM: logo and design package

The "Lamppost" logo: the **l** in *streetlight* rises and curves over like a street lamp, and its red lamp doubles as the dot on the **i**.

## What's in each folder

| Folder | What it's for |
| --- | --- |
| `svg/` | **Use these in the app and on the website.** Sharp at any size, tiny files. |
| `png/` | For places that don't take SVG: email, slides, documents, social media. |
| `favicon/` | Browser-tab icon, phone home-screen icons and the web-app manifest. |
| `design/` | `streetlight-crm-tokens.css`: the colors, fonts, spacing and button/input/card styles for the app. |

### Which logo to use

- **`streetlight-crm-logo.svg`**: the main logo (navy, red lamp). Use it on light backgrounds: the sign-in page, the website, documents.
- **`streetlight-crm-logo-white.svg`**: for dark backgrounds, including the navy sidebar and dark mode.
- **`streetlight-crm-logo-stacked.svg`** and **`-white`**: "CRM" below the name, for narrow or square spaces.
- **`streetlight-crm-wordmark.svg`** and **`-white`**: "streetlight" without "CRM", for when the product name is already clear.
- **`streetlight-crm-mark.svg`** and **`-white`**: the lamppost-and-i symbol alone, with no background.
- **`streetlight-crm-app-icon.svg`**: the symbol on a navy rounded square, for app launchers and the browser tab.
- **`streetlight-crm-logo-navy-only.svg`**: one color only (the lamp is navy too), for one-ink printing, embroidery and stamps.
- **`streetlight-crm-logo-black.svg`**: near-black instead of navy, for when it sits beside Streetlight's black materials.
- **`png/streetlight-crm-social-avatar.png`**: profile picture, safe for circle crops.
- **`png/streetlight-crm-link-preview.png`**: the picture shown when a link is shared (1200 × 630).

The letters in every file are drawn as shapes, not typed text, so the logo looks the same on every computer.

## Colors

| Name | Hex code | Use |
| --- | --- | --- |
| Lamppost Navy | `#1b2b4b` | The logo, the sidebar, secondary buttons |
| Filament Red | `#e0322d` | The lamp, and **one** main button per screen ("Save", "New contact") |
| Filament Red (dark mode) | `#ff4d47` | The lamp and main button on dark backgrounds |
| Ink | `#1d1d1f` | Body text |
| Secondary text | `#6e6e73` | Labels, dates, helper text |
| Surface | `#f5f5f7` | The page behind cards |
| Hairline | `#ececec` | Lines between table rows |

Filament Red, Ink, Surface and Hairline are the Streetlight colors, so the CRM and the publication read as one family. Navy is the CRM's own.

**The one-red rule:** red means "the main thing to click". If two red buttons show on one screen, make one of them navy or outlined.

## Fonts

- **Inter Tight** (Bold 700): the logo, page titles and headings.
- **Inter**: everything else (menus, buttons, tables, forms). It's the same font Streetlight uses.

Both are free. Add this line inside your page's `<head>` to load them:

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@700&display=swap">
```

## Rules that keep the logo looking right

- **Leave space around it.** Keep empty space on every side at least as tall as the "s" in *streetlight*.
- **Don't make it too small.** Use the full logo at least 140 px wide on screen. Below that, use the app icon or the mark.
- **Don't** stretch it, change its colors, add shadows, retype it in a font, or move the lamp.
- **Keep the lamp red.** Use the navy-only version only when you can print just one color.

---

## Putting it into the app

### 1. Copy the files

Put the contents of `favicon/` in your app's top public folder (often `public/`). Put `svg/` and `png/` in `public/images/`, and `design/streetlight-crm-tokens.css` wherever you keep stylesheets.

### 2. Icons and app name: inside `<head>`

```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#1b2b4b">
<meta property="og:image" content="https://YOUR-DOMAIN/images/png/streetlight-crm-link-preview.png">
```

Replace `YOUR-DOMAIN` with your web address. **In Next.js (App Router)**, you can instead put `favicon.ico`, `icon.svg` (renamed from `favicon.svg`) and `apple-icon.png` (renamed from `apple-touch-icon.png`) in the `app/` folder, and Next.js adds these tags for you.

### 3. The styles

Link the tokens file before your other CSS:

```html
<link rel="stylesheet" href="/styles/streetlight-crm-tokens.css">
```

Then use the variables in your own CSS. For example, `color: var(--sl-text);` or `background: var(--sl-navy);`. Change a color once in the tokens file and it updates everywhere. Dark mode follows the user's device setting automatically.

### 4. The sidebar and the sign-in page

```html
<!-- Sidebar (navy) -->
<nav class="sl-sidebar">
  <a href="/" aria-label="Streetlight CRM home">
    <img src="/images/svg/streetlight-crm-logo-white.svg" alt="Streetlight CRM" width="196" height="38">
  </a>
  <a href="/contacts" aria-current="page">Contacts</a>
  <a href="/donors">Donors</a>
  <a href="/tasks">Tasks</a>
</nav>

<!-- Sign-in card -->
<div class="sl-card">
  <img src="/images/svg/streetlight-crm-logo.svg" alt="Streetlight CRM" width="250" height="49">
  <label>Email <input class="sl-input" type="email"></label>
  <label>Password <input class="sl-input" type="password"></label>
  <button class="sl-btn sl-btn--secondary" type="submit">Sign in</button>
</div>

<!-- Buttons -->
<button class="sl-btn sl-btn--primary">New contact</button>
<button class="sl-btn sl-btn--ghost">Cancel</button>
```

### 5. Check it

Upload the files, then hard-refresh the browser (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows). Browsers hold on to old tab icons, so the new one can take a day to show up everywhere.
