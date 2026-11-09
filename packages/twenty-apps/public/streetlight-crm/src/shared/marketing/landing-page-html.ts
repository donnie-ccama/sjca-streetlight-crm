import {
  LANDING_PAGE_UTM_CONTENT_PREFIX,
  type Attribution,
} from 'src/shared/marketing/attribution';
import {
  MAX_GIFT_CENTS,
  MIN_GIFT_CENTS,
} from 'src/shared/marketing/stripe-checkout';

export type LandingPageView = {
  slug: string;
  headline: string;
  bodyHtml: string;
  heroImageUrl: string | null;
  giveLabel: string;
  prayLabel: string;
  volunteerLabel: string;
  organizationName: string;
  brandColor: string;
  turnstileSiteKey: string;
  attribution: Attribution;
  routeBasePath: string;
};

const DEFAULT_BRAND_COLOR = '#1f2937';

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const ALLOWED_TAGS = new Set(['p', 'br', 'strong', 'em', 'ul', 'ol', 'li']);
const TAG_PATTERN = /<\/?[a-zA-Z][^>]*>/g;
const HTTPS_HREF_PATTERN =
  /\shref\s*=\s*(?:"(https:\/\/[^"]*)"|'(https:\/\/[^']*)')/i;

const sanitizeTag = (tag: string): string | null => {
  const name = /^<\/?([a-zA-Z0-9]+)/.exec(tag)?.[1]?.toLowerCase() ?? '';
  const isClosing = tag.startsWith('</');

  if (ALLOWED_TAGS.has(name)) {
    return isClosing ? `</${name}>` : `<${name}>`;
  }

  if (name === 'a') {
    if (isClosing) return '</a>';

    const href = HTTPS_HREF_PATTERN.exec(tag);
    const url = href?.[1] ?? href?.[2];

    return url === undefined
      ? null
      : `<a href="${escapeHtml(url)}" rel="noopener noreferrer" target="_blank">`;
  }

  return null;
};

export const sanitizeBodyHtml = (bodyHtml: string): string => {
  let result = '';
  let lastIndex = 0;

  for (const match of bodyHtml.matchAll(TAG_PATTERN)) {
    result += escapeHtml(bodyHtml.slice(lastIndex, match.index));
    const tag = sanitizeTag(match[0]);

    result += tag ?? escapeHtml(match[0]);
    lastIndex = match.index + match[0].length;
  }

  return result + escapeHtml(bodyHtml.slice(lastIndex));
};

const LINK_PATTERN = /\[([^\]\n]+)\]\((https:\/\/[^\s()<>"']+)\)/g;
const BULLET_PATTERN = /^\s*[-*+]\s+(.*)$/;
const NUMBERED_PATTERN = /^\s*\d+[.)]\s+(.*)$/;

const renderEmphasis = (text: string): string =>
  text
    .replace(/\*\*(?=\S)(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(?=\S)(.+?)\*/g, '<em>$1</em>');

const renderInline = (text: string): string => {
  let rendered = '';
  let lastIndex = 0;

  // Links are split out first so emphasis never rewrites a URL.
  for (const match of text.matchAll(LINK_PATTERN)) {
    rendered += renderEmphasis(text.slice(lastIndex, match.index));
    rendered += `<a href="${match[2]}">${renderEmphasis(match[1])}</a>`;
    lastIndex = match.index + match[0].length;
  }

  return rendered + renderEmphasis(text.slice(lastIndex));
};

const renderBlock = (block: string): string => {
  const lines = block.split('\n').filter((line) => line.trim() !== '');
  let html = '';
  let paragraph: string[] = [];
  // Cast keeps TypeScript from narrowing to null; the flush helpers reassign it.
  let list = null as { tag: 'ul' | 'ol'; items: string[] } | null;

  const flushParagraph = () => {
    if (paragraph.length > 0) html += `<p>${paragraph.join('<br>')}</p>`;
    paragraph = [];
  };
  const flushList = () => {
    if (list !== null) {
      html += `<${list.tag}>${list.items.map((item) => `<li>${item}</li>`).join('')}</${list.tag}>`;
    }
    list = null;
  };

  for (const line of lines) {
    const bullet = BULLET_PATTERN.exec(line);
    const numbered = bullet === null ? NUMBERED_PATTERN.exec(line) : null;
    const item = bullet ?? numbered;

    if (item === null) {
      flushList();
      paragraph.push(renderInline(line.trim()));
      continue;
    }

    const tag = bullet !== null ? 'ul' : 'ol';

    flushParagraph();

    if (list?.tag !== tag) {
      flushList();
      list = { tag, items: [] };
    }

    list.items.push(renderInline(item[1].trim()));
  }

  flushParagraph();
  flushList();

  return html;
};

// Output still goes through sanitizeBodyHtml, which escapes all text once.
export const markdownToBodyHtml = (markdown: string): string =>
  markdown
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map(renderBlock)
    .join('');

export const toScriptJson = (value: unknown): string =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

export const PAGE_SCRIPT = `
(function () {
  var config = JSON.parse(document.getElementById('page-config').textContent);
  var visitorKey = '';
  try {
    visitorKey = localStorage.getItem('visitor_key') || '';
  } catch (error) {}
  if (!visitorKey) {
    var cookieMatch = document.cookie.match(/(?:^|; )visitor_key=([^;]+)/);
    if (cookieMatch) visitorKey = cookieMatch[1];
  }
  if (!visitorKey) {
    visitorKey = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : String(Date.now()) + '-' + Math.random().toString(16).slice(2);
    try {
      localStorage.setItem('visitor_key', visitorKey);
    } catch (error) {
      document.cookie = 'visitor_key=' + visitorKey + '; max-age=31536000; path=/; SameSite=Lax';
    }
  }

  function withInviteCode(payload) {
    if (config.inviteCode) payload.inviteCode = config.inviteCode;
    return payload;
  }

  function beacon(path, extra) {
    var payload = withInviteCode(Object.assign({ visitorKey: visitorKey }, config.utm, extra || {}));
    var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    return navigator.sendBeacon ? navigator.sendBeacon(config.base + path, blob) : false;
  }

  if (config.logsVisit) beacon('/visit');

  var givePanel = document.getElementById('give-panel');
  if (givePanel) {
    var giveForm = givePanel.querySelector('form');
    var typeButtons = givePanel.querySelectorAll('.give-type');
    var amountButtons = givePanel.querySelectorAll('.give-amount');
    var otherInput = givePanel.querySelector('[name=otherAmount]');
    var continueButton = givePanel.querySelector('.give-continue');
    var giveMessage = givePanel.querySelector('.message');
    var overLimitHint = givePanel.querySelector('.give-over-limit');
    var giftType = '';
    var submitting = false;
    var giveTrigger = null;

    function setPressed(buttons, chosen) {
      buttons.forEach(function (button) {
        button.setAttribute('aria-pressed', button === chosen ? 'true' : 'false');
      });
    }
    function otherAmountCents() {
      var text = otherInput.value.trim();
      if (!/^\\d+(\\.\\d{1,2})?$/.test(text)) return 0;
      return Math.round(Number(text) * 100);
    }
    function chosenCents() {
      var pressed = givePanel.querySelector('.give-amount[aria-pressed="true"]');
      return pressed ? Number(pressed.getAttribute('data-amount')) * 100 : otherAmountCents();
    }
    function updateContinue() {
      var cents = chosenCents();
      overLimitHint.hidden = cents <= ${MAX_GIFT_CENTS};
      continueButton.disabled = submitting || !giftType || cents < ${MIN_GIFT_CENTS} || cents > ${MAX_GIFT_CENTS};
    }
    function preselectAmount(amount) {
      var match = null;
      amountButtons.forEach(function (button) {
        if (button.getAttribute('data-amount') === amount) match = button;
      });
      setPressed(amountButtons, match);
      otherInput.value = match ? '' : amount;
    }

    function openGivePanel(trigger) {
      beacon('/give-click');
      giveTrigger = trigger;
      giveMessage.className = 'message';
      giveMessage.textContent = '';
      var ask = trigger.closest('.thanks-ask');
      var picked = ask ? ask.querySelector('.amount[aria-pressed="true"]') : null;
      if (picked) preselectAmount(picked.getAttribute('data-amount'));
      updateContinue();
      document.documentElement.classList.add('give-panel-open');
      if (typeof givePanel.showModal === 'function') givePanel.showModal();
      else givePanel.setAttribute('open', '');
      typeButtons[0].focus();
    }

    function onGivePanelClosed() {
      document.documentElement.classList.remove('give-panel-open');
      if (giveTrigger) giveTrigger.focus();
      giveTrigger = null;
    }

    function closeGivePanel() {
      if (typeof givePanel.close === 'function') {
        givePanel.close();
        return;
      }
      givePanel.removeAttribute('open');
      onGivePanelClosed();
    }

    givePanel.addEventListener('close', onGivePanelClosed);
    givePanel.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeGivePanel();
    });
    givePanel.querySelector('.give-panel-close').addEventListener('click', closeGivePanel);

    typeButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        giftType = button.getAttribute('data-gift-type');
        setPressed(typeButtons, button);
        updateContinue();
      });
    });
    amountButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        setPressed(amountButtons, button);
        otherInput.value = '';
        updateContinue();
      });
    });
    otherInput.addEventListener('input', function () {
      setPressed(amountButtons, null);
      updateContinue();
    });

    giveForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var amountCents = chosenCents();
      if (submitting || !giftType || amountCents < ${MIN_GIFT_CENTS} || amountCents > ${MAX_GIFT_CENTS}) return;
      submitting = true;
      continueButton.disabled = true;
      giveMessage.className = 'message';
      giveMessage.textContent = '';
      fetch(config.base + '/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ giftType: giftType, amountCents: amountCents, utm: config.utm, inviteCode: config.inviteCode || null })
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (json) {
          if (!response.ok || typeof json.url !== 'string') throw new Error('checkout');
          window.location.href = json.url;
        });
      }).catch(function () {
        giveMessage.className = 'message error';
        giveMessage.textContent = 'We could not start your gift. Please try again.';
        submitting = false;
        updateContinue();
      });
    });

    // Back from Stripe can restore this page from the cache with Continue still off.
    window.addEventListener('pageshow', function (event) {
      if (!event.persisted) return;
      submitting = false;
      updateContinue();
    });

    document.querySelectorAll('.give-trigger').forEach(function (giveButton) {
      giveButton.addEventListener('click', function () {
        openGivePanel(giveButton);
      });
    });
  }

  // One widget per form, made on first use, so two widgets never challenge at
  // page load and a token is fresh when the visitor sends.
  var pendingForms = [];
  function renderWidget(form) {
    if (form.widgetId !== undefined) return;
    if (!window.turnstile) {
      if (pendingForms.indexOf(form) < 0) pendingForms.push(form);
      return;
    }
    form.widgetId = window.turnstile.render(form.querySelector('.turnstile-slot'), {
      sitekey: config.siteKey,
      'refresh-expired': 'auto',
      retry: 'auto'
    });
  }
  window.onLandingTurnstileLoad = function () {
    pendingForms.splice(0).forEach(renderWidget);
  };
  function widgetToken(form) {
    if (!window.turnstile || form.widgetId === undefined) return '';
    if (window.turnstile.isExpired(form.widgetId)) {
      window.turnstile.reset(form.widgetId);
      return '';
    }
    return window.turnstile.getResponse(form.widgetId) || '';
  }

  // Returns '' and shows the check prompt when the visitor must finish Turnstile first.
  function tokenOrPrompt(form, message) {
    renderWidget(form);
    var token = widgetToken(form);
    if (!token) {
      message.className = 'message error';
      message.textContent = 'Please finish the "Verify you are human" check, then send again.';
    }
    return token;
  }

  function postForm(form, path, body, onSuccess) {
    var message = form.querySelector('.message');
    message.textContent = '';
    fetch(config.base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (json) {
        if (response.ok) {
          if (window.turnstile) window.turnstile.remove(form.widgetId);
          onSuccess(json);
          return;
        }
        message.className = 'message error';
        message.textContent = json.message || 'Something went wrong. Please try again.';
        if (window.turnstile) window.turnstile.reset(form.widgetId);
      });
    }).catch(function () {
      message.className = 'message error';
      message.textContent = 'Network error. Please try again.';
      if (window.turnstile) window.turnstile.reset(form.widgetId);
    });
  }

  var thanksScreen = document.getElementById('thanks');
  var inviteSection = document.getElementById('invite');
  var inviteToken = '';

  function keepInviteSender(firstName, json) {
    if (typeof json.inviteToken === 'string') inviteToken = json.inviteToken;
    if (!inviteSection) return;
    var senderInput = inviteSection.querySelector('[name=senderFirstName]');
    if (senderInput) senderInput.value = firstName;
  }

  function showThanksScreen(form, firstName, json) {
    var joinSection = form.closest('section');
    if (joinSection) {
      joinSection.parentNode.insertBefore(thanksScreen, joinSection);
      joinSection.hidden = true;
    }
    thanksScreen.hidden = false;
    var screenTitle = thanksScreen.querySelector('.thanks-screen-title');
    screenTitle.textContent = firstName ? 'Thank you, ' + firstName + '.' : 'Thank you.';
    keepInviteSender(firstName, json);
    if (inviteSection) {
      thanksScreen.parentNode.insertBefore(inviteSection, thanksScreen.nextSibling);
    }
    thanksScreen.scrollIntoView({ block: 'start' });
    screenTitle.focus({ preventScroll: true });
  }

  document.querySelectorAll('.thanks-skip').forEach(function (skipButton) {
    skipButton.addEventListener('click', function () {
      skipButton.closest('.thanks-ask').hidden = true;
    });
  });

  document.querySelectorAll('.amount').forEach(function (amountButton) {
    amountButton.addEventListener('click', function () {
      amountButton.parentNode.querySelectorAll('.amount').forEach(function (other) {
        other.setAttribute('aria-pressed', other === amountButton ? 'true' : 'false');
      });
    });
  });

  document.querySelectorAll('form[data-action]').forEach(function (form) {
    if (form.getAttribute('data-action') === 'invite') return;
    form.addEventListener('focusin', function () { renderWidget(form); });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var token = tokenOrPrompt(form, form.querySelector('.message'));
      if (!token) return;
      var data = new FormData(form);
      var body = {
        firstName: data.get('firstName'),
        lastName: data.get('lastName'),
        email: data.get('email'),
        phone: data.get('phone'),
        smsConsent: form.querySelector('[name=smsConsent]').checked ? 'on' : '',
        website: data.get('website'),
        turnstileToken: token,
        visitorKey: visitorKey
      };
      withInviteCode(Object.assign(body, config.utm));
      var action = form.getAttribute('data-action');
      postForm(form, '/' + action, body, function (json) {
        var firstName = String(body.firstName || '').trim();
        if (action === 'pray' && thanksScreen) {
          showThanksScreen(form, firstName, json);
          return;
        }
        if (action === 'pray') keepInviteSender(firstName, json);
        var thanks = form.parentNode.querySelector('.thanks');
        var title = thanks.querySelector('.thanks-title');
        title.textContent = firstName ? 'Thank you, ' + firstName + '!' : 'Thank you!';
        form.hidden = true;
        thanks.hidden = false;
        thanks.focus();
        thanks.scrollIntoView({ block: 'center' });
      });
    });
  });

  var inviteForm = document.querySelector('form[data-action="invite"]');
  if (inviteForm) {
    var inviteSubmit = inviteForm.querySelector('button[type=submit]');
    var labelTemplate = inviteSubmit.getAttribute('data-label-template');
    var friendInput = inviteForm.querySelector('[name=friendFirstName]');
    var sendBlock = inviteForm.parentNode.querySelector('.invite-send');
    var shareButton = sendBlock.querySelector('.invite-share');
    var copyButton = sendBlock.querySelector('.invite-copy');
    var emailLink = sendBlock.querySelector('.invite-email');
    var linkInput = sendBlock.querySelector('.invite-link');
    var inviteText = '';
    var inviteLink = '';

    if (!navigator.share) shareButton.hidden = true;

    friendInput.addEventListener('input', function () {
      inviteSubmit.textContent = labelTemplate.split('{friend}').join(friendInput.value.trim() || 'a friend');
    });

    inviteForm.addEventListener('focusin', function () { renderWidget(inviteForm); });
    inviteForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var token = tokenOrPrompt(inviteForm, inviteForm.querySelector('.message'));
      if (!token) return;
      var data = new FormData(inviteForm);
      var friend = String(data.get('friendFirstName') || '').trim();
      var body = {
        senderFirstName: data.get('senderFirstName'),
        friendFirstName: data.get('friendFirstName'),
        website: data.get('website'),
        turnstileToken: token,
        visitorKey: visitorKey
      };
      if (inviteToken) body.inviteToken = inviteToken;
      Object.assign(body, config.utm);
      postForm(inviteForm, '/invite', body, function (json) {
        inviteLink = location.origin + location.pathname + '?i=' + encodeURIComponent(String(json.code || ''));
        inviteText = config.inviteMessage.split('{friend}').join(friend);
        linkInput.value = inviteLink;
        shareButton.textContent = 'Send to ' + friend;
        emailLink.href = 'mailto:?subject=' + encodeURIComponent(inviteText)
          + '&body=' + encodeURIComponent(inviteText + '\\n\\n' + inviteLink);
        inviteForm.hidden = true;
        sendBlock.hidden = false;
        (shareButton.hidden ? copyButton : shareButton).focus();
      });
    });

    // The share menu opens only from a tap, so the share is its own second tap.
    shareButton.addEventListener('click', function () {
      navigator.share({ text: inviteText, url: inviteLink }).catch(function () {});
    });

    copyButton.addEventListener('click', function () {
      function copied() { copyButton.textContent = 'Copied.'; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(inviteLink).then(copied, function () {
          linkInput.select();
        });
        return;
      }
      linkInput.select();
      if (document.execCommand('copy')) copied();
    });
  }
})();
`;

export type FormAction = 'pray' | 'volunteer';

export const THANK_YOU_TEXT_BY_ACTION: Record<FormAction, string> = {
  pray: 'We will send you the weekly prayer guide.',
  volunteer: 'Check your email for the next step.',
};

// The page script and the POST routes depend on these classes, data-action values, and input names.
export const renderFormMarkup = (input: {
  action: FormAction;
  label: string;
}): string => {
  const label = escapeHtml(input.label);
  const thankYouText = THANK_YOU_TEXT_BY_ACTION[input.action];

  return `<form data-action="${input.action}" novalidate>
<label>First name<input name="firstName" autocomplete="given-name"></label>
<label>Last name<input name="lastName" autocomplete="family-name"></label>
<label>Email<input name="email" type="email" required autocomplete="email"></label>
<label>Phone (optional)<input name="phone" type="tel" autocomplete="tel"></label>
<label class="check"><input name="smsConsent" type="checkbox"> I agree to receive text messages. Message and data rates may apply. Reply STOP to opt out.</label>
<div class="hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
<div class="turnstile-slot"></div>
<button type="submit">${label}</button>
<p class="message" role="status"></p>
</form>
<div class="thanks" hidden tabindex="-1"><h3 class="thanks-title">Thank you!</h3><p>${thankYouText}</p></div>`;
};

const renderForm = (input: { action: FormAction; label: string }): string =>
  `<section class="card">
<h2>${escapeHtml(input.label)}</h2>
${renderFormMarkup(input)}
</section>`;

export const TURNSTILE_SCRIPT_TAG =
  '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onLandingTurnstileLoad" async defer></script>';

export const resolveBrandColor = (color: string): string =>
  /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : DEFAULT_BRAND_COLOR;

const INVITE_UTM_TERM_PREFIX = 'inv-';

export const buildPageConfig = (input: {
  slug: string;
  routeBasePath: string;
  turnstileSiteKey: string;
  attribution: Attribution;
  inviteCode: string | null;
  inviteMessage: string;
  logsVisit?: boolean;
}) => ({
  base: `${input.routeBasePath.replace(/\/+$/, '')}/${encodeURIComponent(input.slug)}`,
  siteKey: input.turnstileSiteKey,
  utm: input.attribution.utmRaw,
  giveUtm: {
    ...input.attribution.utmRaw,
    utm_content: `${LANDING_PAGE_UTM_CONTENT_PREFIX}${input.slug}`,
    ...(input.inviteCode === null
      ? {}
      : { utm_term: `${INVITE_UTM_TERM_PREFIX}${input.inviteCode}` }),
  } as Record<string, string>,
  inviteCode: input.inviteCode,
  inviteMessage: input.inviteMessage,
  logsVisit: input.logsVisit !== false,
});

export const renderLandingPage = (view: LandingPageView): string => {
  const brandColor = resolveBrandColor(view.brandColor);
  const config = buildPageConfig({
    ...view,
    inviteCode: null,
    inviteMessage: '',
  });
  const hero = view.heroImageUrl?.startsWith('https://')
    ? `<img class="hero" src="${escapeHtml(view.heroImageUrl)}" alt="">`
    : '';
  const forms = [
    view.prayLabel === ''
      ? ''
      : renderForm({ action: 'pray', label: view.prayLabel }),
    view.volunteerLabel === ''
      ? ''
      : renderForm({ action: 'volunteer', label: view.volunteerLabel }),
  ].join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(view.headline)} | ${escapeHtml(view.organizationName)}</title>
<style>
:root{--brand:${brandColor}}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;background:#faf8f5;line-height:1.55}
main{max-width:560px;margin:0 auto;padding:16px}
.hero{width:100%;height:auto;border-radius:12px;display:block}
h1{font-size:1.75rem;line-height:1.2;margin:16px 0 8px}
h2{font-size:1.25rem;margin:0 0 12px}
.body{margin-bottom:16px}
.body a{color:var(--brand)}
.card{background:#fff;border-radius:12px;padding:16px;margin:16px 0;box-shadow:0 1px 3px rgba(0,0,0,.08)}
label{display:block;font-size:.9rem;margin-bottom:12px}
input:not([type=checkbox]){display:block;width:100%;font-size:1rem;padding:12px;margin-top:4px;border:1px solid #c9c4bc;border-radius:8px}
.check{display:flex;gap:8px;align-items:flex-start;font-size:.8rem}
.check input{margin-top:3px}
.hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
button{width:100%;font-size:1.05rem;font-weight:600;padding:14px;border:0;border-radius:10px;background:var(--brand);color:#fff;cursor:pointer}
.message{min-height:1.2em;margin:12px 0 0;font-size:.9rem}
.message.ok{color:#166534}
.message.error{color:#b91c1c}
.thanks{text-align:center;padding:24px 8px}
.thanks:focus{outline:none}
.thanks-title{margin:0 0 8px;font-size:1.4rem}
[hidden]{display:none!important}
footer{text-align:center;font-size:.8rem;color:#6b6b6b;padding:16px 0 32px}
</style>
${TURNSTILE_SCRIPT_TAG}
</head>
<body>
<main>
${hero}
<h1>${escapeHtml(view.headline)}</h1>
<div class="body">${sanitizeBodyHtml(view.bodyHtml)}</div>
${forms}
</main>
<footer>${escapeHtml(view.organizationName)}</footer>
<script type="application/json" id="page-config">${toScriptJson(config)}</script>
<script>${PAGE_SCRIPT}</script>
</body>
</html>`;
};

export const renderNotFoundPage = (
  organizationName: string,
): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found | ${escapeHtml(organizationName)}</title>
<style>body{margin:0;font-family:system-ui,sans-serif;text-align:center;padding:64px 16px;color:#1a1a1a}</style>
</head>
<body>
<h1>Page not found</h1>
<p>This page is not available. Thank you for your interest in ${escapeHtml(organizationName)}.</p>
</body>
</html>`;
