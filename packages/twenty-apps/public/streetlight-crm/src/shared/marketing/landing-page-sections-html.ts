import type { Attribution } from 'src/shared/marketing/attribution';
import { GIVING_QUESTION_MESSAGE_MAX_LENGTH } from 'src/shared/marketing/giving-question';
import {
  buildPageConfig,
  escapeHtml,
  PAGE_SCRIPT,
  renderFormMarkup,
  THANK_YOU_TEXT_BY_ACTION,
  toScriptJson,
  TURNSTILE_SCRIPT_TAG,
  type FormAction,
} from 'src/shared/marketing/landing-page-html';
import {
  DEFAULT_INVITE_MESSAGE,
  isHttpsUrl,
  type AmountItem,
  type CardItem,
  type SectionButton,
  type SectionContent,
  type StatItem,
  type TierItem,
} from 'src/shared/marketing/sections';
import {
  MAKE_MONTHLY_WINDOW_SECONDS,
  MIN_GIFT_CENTS,
} from 'src/shared/marketing/stripe-checkout';
import type {
  ButtonAction,
  PageType,
  SectionType,
} from 'src/shared/marketing/types';

export type SectionPageView = {
  slug: string;
  title: string;
  shareDescription: string;
  shareImageUrl: string | null;
  organizationName: string;
  tagline: string;
  logoUrl: string | null;
  siteUrl: string | null;
  mailingAddress: string;
  pageType: PageType | null;
  // True when Stripe is set up; Give buttons and the give panel show only then.
  giveEnabled: boolean;
  giveAmounts: number[];
  givingQuestionEnabled: boolean;
  turnstileSiteKey: string;
  attribution: Attribution;
  routeBasePath: string;
  sections: SectionContent[];
  // Keyed by PublishedPhoto.fileId.
  photoUrls: Record<string, string>;
  // Set only for a valid ?i= code of this page.
  invite: { senderFirstName: string; friendFirstName: string } | null;
  inviteCode: string | null;
  // The builder preview: no beacons, no Turnstile, and forms never post.
  previewMode?: boolean;
  previewShowsThanks?: boolean;
};

// window.name survives each srcDoc reload of the frame, so it carries the scroll position.
const PREVIEW_PAGE_SCRIPT = `
(function () {
  var SCROLL_KEY = 'landing-preview-scroll:';
  var savedScrollY = window.name.indexOf(SCROLL_KEY) === 0
    ? Number(window.name.slice(SCROLL_KEY.length)) || 0
    : 0;
  function restoreScroll() { window.scrollTo(0, savedScrollY); }
  restoreScroll();
  window.addEventListener('load', restoreScroll);
  window.addEventListener('scroll', function () {
    window.name = SCROLL_KEY + window.scrollY;
  }, { passive: true });
  document.addEventListener('click', function (event) {
    var target = event.target.closest ? event.target.closest('a[href], .give-trigger') : null;
    if (!target) return;
    event.preventDefault();
    var href = target.getAttribute('href') || '';
    if (href.charAt(0) !== '#') return;
    var anchor = href === '#' ? null : document.getElementById(href.slice(1));
    if (anchor) anchor.scrollIntoView({ behavior: 'smooth' });
  });
  document.querySelectorAll('form[data-action]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var message = form.querySelector('.message');
      message.className = 'message';
      message.textContent = 'Forms are off in the preview.';
    });
  });
})();
`;

const FONTS_STYLESHEET_URL =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Inter+Tight:wght@600;700&display=swap';

const ANCHOR_BY_TYPE: Partial<Record<SectionType, string>> = {
  GIVE: 'give',
  JOIN: 'join',
  VOLUNTEER: 'volunteer',
};

const FORM_ACTION_BY_TYPE: Record<'JOIN' | 'VOLUNTEER', FormAction> = {
  JOIN: 'pray',
  VOLUNTEER: 'volunteer',
};

const DEFAULT_FORM_LABEL_BY_TYPE: Record<'JOIN' | 'VOLUNTEER', string> = {
  JOIN: 'Join',
  VOLUNTEER: 'Volunteer',
};

const DEFAULT_INVITE_LABEL_TEMPLATE = 'Invite {friend}';

const isSafeUrl = (value: string | null | undefined): value is string =>
  typeof value === 'string' && isHttpsUrl(value);

const hasSectionType = (view: SectionPageView, sectionType: SectionType) =>
  view.sections.some((section) => section.sectionType === sectionType);

const isFirstOfType = (section: SectionContent, view: SectionPageView) =>
  view.sections.find((other) => other.sectionType === section.sectionType)
    ?.id === section.id;

const isThanksPreview = (view: SectionPageView): boolean =>
  view.previewMode === true &&
  view.previewShowsThanks === true &&
  hasSectionType(view, 'THANKS');

export const renderHeadingWithAccent = (heading: string): string =>
  escapeHtml(heading).replace(/\*([^*\n]+)\*/g, '<em class="accent">$1</em>');

const renderLines = (value: string): string =>
  escapeHtml(value.replace(/\r\n?/g, '\n')).replace(/\n/g, '<br>');

const renderText = (text: string, className: string): string => {
  if (text === '') {
    return '';
  }

  const paragraphs = text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '')
    .map((paragraph) => `<p>${renderLines(paragraph)}</p>`)
    .join('');

  return `<div class="text ${className}">${paragraphs}</div>`;
};

const renderEyebrow = (eyebrow: string): string =>
  eyebrow === '' ? '' : `<p class="eyebrow">${escapeHtml(eyebrow)}</p>`;

const renderTitle = (
  heading: string,
  tag: 'h1' | 'h2',
  className: string,
): string =>
  heading === ''
    ? ''
    : `<${tag} class="${className}">${renderHeadingWithAccent(heading)}</${tag}>`;

const renderPhoto = (
  section: SectionContent,
  view: SectionPageView,
  className: string,
  loading: 'eager' | 'lazy',
): string => {
  const photo = section.photo;

  if (
    photo === null ||
    !Object.prototype.hasOwnProperty.call(view.photoUrls, photo.fileId)
  ) {
    return '';
  }

  const url = view.photoUrls[photo.fileId];

  return isSafeUrl(url)
    ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(photo.altText)}" class="${className}" loading="${loading}">`
    : '';
};

export const toPageType = (value: unknown): PageType | null =>
  value === 'ONE_STEP' || value === 'TWO_STEP' ? value : null;

// The red rule: only the page's main ask is red. A page without a type acts as One-Step.
export const isMainAsk = (
  action: ButtonAction,
  sectionType: SectionType,
  pageType: PageType | null,
): boolean =>
  pageType === 'TWO_STEP'
    ? action === 'JOIN' || (action === 'GIVE' && sectionType === 'THANKS')
    : action === 'GIVE';

const renderButtonWithClasses = (
  button: SectionButton | null,
  view: SectionPageView,
  className: string,
): string => {
  if (button === null || button.label === '') {
    return '';
  }

  const label = escapeHtml(button.label);

  switch (button.action) {
    case 'GIVE':
      return view.giveEnabled
        ? `<button type="button" class="${className} give-trigger">${label}</button>`
        : '';
    case 'JOIN':
    case 'VOLUNTEER':
      return hasSectionType(view, button.action)
        ? `<a class="${className}" href="#${ANCHOR_BY_TYPE[button.action]}">${label}</a>`
        : '';
    case 'LINK':
      return isSafeUrl(button.url)
        ? `<a class="${className}" href="${escapeHtml(button.url)}" rel="noopener">${label}</a>`
        : '';
    default:
      return '';
  }
};

export const renderButton = (
  button: SectionButton | null,
  view: SectionPageView,
  sizeClassName: string,
  sectionType: SectionType,
): string =>
  button === null
    ? ''
    : renderButtonWithClasses(
        button,
        view,
        `btn ${
          isMainAsk(button.action, sectionType, view.pageType)
            ? 'btn-primary'
            : 'btn-secondary'
        } ${sizeClassName}`,
      );

const renderInviteCard = (
  invite: NonNullable<SectionPageView['invite']>,
  view: SectionPageView,
): string => {
  const initial = Array.from(invite.senderFirstName)[0]?.toUpperCase() ?? '';

  return `<div class="invite-card"><span class="invite-card-initial" aria-hidden="true">${escapeHtml(initial)}</span><span class="invite-card-copy"><strong class="invite-card-title">${escapeHtml(invite.friendFirstName)}, ${escapeHtml(invite.senderFirstName)} invited you.</strong>${
    view.shareDescription === ''
      ? ''
      : `<span class="invite-card-description">${escapeHtml(view.shareDescription)}</span>`
  }</span></div>`;
};

const renderHero = (section: SectionContent, view: SectionPageView): string => {
  const buttons = [
    renderButton(section.primaryButton, view, 'btn-large', 'HERO'),
    renderButton(section.secondaryButton, view, 'btn-large', 'HERO'),
  ].join('');
  const photo = renderPhoto(section, view, 'photo-image', 'eager');
  const badge =
    section.badgeValue === '' && section.badgeText === ''
      ? ''
      : `<div class="badge">${
          section.badgeValue === ''
            ? ''
            : `<span class="badge-value">${escapeHtml(section.badgeValue)}</span>`
        }${
          section.badgeText === ''
            ? ''
            : `<span class="badge-text">${renderLines(section.badgeText)}</span>`
        }</div>`;
  // Without a photo the badge has nothing to float over, so it joins the text column.
  const media =
    photo === ''
      ? ''
      : `<div class="hero-media"><div class="photo photo-portrait">${photo}</div>${badge}</div>`;

  const inviteCard =
    view.invite !== null && isFirstOfType(section, view)
      ? `${renderInviteCard(view.invite, view)}\n`
      : '';

  return `<section class="hero">
${inviteCard}<div class="hero-inner">
<div class="hero-copy">
${renderEyebrow(section.eyebrow)}
${renderTitle(section.heading, isFirstOfType(section, view) ? 'h1' : 'h2', 'hero-title')}
${renderText(section.text, 'hero-text')}
${buttons === '' ? '' : `<div class="actions">${buttons}</div>`}
${section.trustLine === '' ? '' : `<p class="trust">${escapeHtml(section.trustLine)}</p>`}
${photo === '' ? badge : ''}
</div>
${media}
</div>
</section>`;
};

const renderStats = (section: SectionContent): string => {
  const items = section.items as StatItem[];

  if (items.length === 0) {
    return '';
  }

  const stats = items
    .map(
      (item) =>
        `<div class="stat"><span class="stat-value">${escapeHtml(item.value)}</span>${
          item.label === ''
            ? ''
            : `<span class="stat-label">${escapeHtml(item.label)}</span>`
        }</div>`,
    )
    .join('');

  return `<section class="stats"><div class="stats-grid">${stats}</div></section>`;
};

const renderStory = (
  section: SectionContent,
  view: SectionPageView,
): string => {
  const photo = renderPhoto(section, view, 'photo-image', 'lazy');
  const cards = (section.items as CardItem[])
    .map(
      (item) =>
        `<div class="card"><span class="card-title">${escapeHtml(item.title)}</span>${
          item.text === ''
            ? ''
            : `<span class="card-text">${escapeHtml(item.text)}</span>`
        }</div>`,
    )
    .join('');

  return `<section class="story">
${photo === '' ? '' : `<div class="story-media"><div class="photo photo-landscape">${photo}</div></div>`}
<div class="story-copy">
${renderEyebrow(section.eyebrow)}
${renderTitle(section.heading, 'h2', 'section-title')}
${renderText(section.text, 'story-text')}
${cards === '' ? '' : `<div class="cards">${cards}</div>`}
</div>
</section>`;
};

const renderTier = (tier: TierItem): string =>
  `<div class="tier${tier.featured ? ' tier-featured' : ''}">${
    tier.featured ? '<span class="tier-flag">Most chosen</span>' : ''
  }${
    tier.amount === ''
      ? ''
      : `<span class="tier-amount">${escapeHtml(tier.amount)}</span>`
  }<span class="tier-title">${escapeHtml(tier.title)}</span>${
    tier.text === ''
      ? ''
      : `<span class="tier-text">${escapeHtml(tier.text)}</span>`
  }</div>`;

const renderGive = (section: SectionContent, view: SectionPageView): string => {
  const tiers = (section.items as TierItem[]).map(renderTier).join('');
  const button = renderButton(section.primaryButton, view, 'btn-xl', 'GIVE');
  const smallPrint =
    section.smallPrint === ''
      ? ''
      : `<span class="small-print">${escapeHtml(section.smallPrint)}</span>`;
  const anchor = isFirstOfType(section, view) ? ' id="give"' : '';

  return `<section class="give"${anchor}>
<div class="give-inner">
<div class="give-head">
${renderEyebrow(section.eyebrow)}
${renderTitle(section.heading, 'h2', 'give-title')}
${renderText(section.text, 'give-text')}
</div>
${tiers === '' ? '' : `<div class="tiers">${tiers}</div>`}
${button === '' && smallPrint === '' ? '' : `<div class="give-cta">${button}${smallPrint}</div>`}
</div>
</section>`;
};

const renderQuote = (
  section: SectionContent,
  view: SectionPageView,
): string => {
  const photo = renderPhoto(section, view, 'quote-photo', 'lazy');

  return `<section class="quote">
<div class="quote-inner">
${photo === '' ? '' : `<div class="quote-media">${photo}</div>`}
<div class="quote-body">
${section.heading === '' ? '' : `<p class="quote-text">${renderHeadingWithAccent(section.heading)}</p>`}
${section.text === '' ? '' : `<span class="quote-by">${renderLines(section.text)}</span>`}
</div>
</div>
</section>`;
};

const renderFormSection = (
  section: SectionContent,
  sectionType: 'JOIN' | 'VOLUNTEER',
  view: SectionPageView,
): string => {
  const label =
    section.primaryButton?.label || DEFAULT_FORM_LABEL_BY_TYPE[sectionType];
  const mainAskClass = isMainAsk(sectionType, sectionType, view.pageType)
    ? ' join-main'
    : '';
  const hidden =
    sectionType === 'JOIN' &&
    isThanksPreview(view) &&
    isFirstOfType(section, view)
      ? ' hidden'
      : '';

  return `<section class="join${mainAskClass}" id="${ANCHOR_BY_TYPE[sectionType]}"${hidden}>
<div class="join-card">
<div class="join-copy">
${renderEyebrow(section.eyebrow)}
${renderTitle(section.heading, 'h2', 'join-title')}
${renderText(section.text, 'join-text')}
</div>
<div class="join-form">
${renderFormMarkup({ action: FORM_ACTION_BY_TYPE[sectionType], label })}
</div>
</div>
</section>`;
};

const renderAmounts = (items: AmountItem[]): string =>
  items.length === 0
    ? ''
    : `<div class="amounts">${items
        .map(
          (item) =>
            `<button type="button" class="amount" data-amount="${escapeHtml(item.amount)}" aria-pressed="false">$${escapeHtml(item.amount)}</button>`,
        )
        .join('')}</div>`;

const renderSiteVisit = (view: SectionPageView): string =>
  isSafeUrl(view.siteUrl)
    ? `<div class="site-visit"><a class="site-visit-link" href="${escapeHtml(view.siteUrl)}" rel="noopener">Visit ${escapeHtml(new URL(view.siteUrl).host)}</a></div>`
    : '';

const renderThanks = (
  section: SectionContent,
  view: SectionPageView,
): string => {
  const button = renderButton(section.primaryButton, view, 'btn-xl', 'THANKS');
  // Amounts only preselect the give panel amount, so they show only with a Give button.
  const amounts =
    button === '' ? '' : renderAmounts(section.items as AmountItem[]);
  const skip =
    section.smallPrint === ''
      ? ''
      : `<button type="button" class="thanks-skip">${escapeHtml(section.smallPrint)}</button>`;
  const hidden = isThanksPreview(view) ? '' : ' hidden';

  return `<section class="thanks-screen" id="thanks"${hidden}>
<div class="thanks-screen-inner">
<div class="thanks-screen-head">
<span class="thanks-check" aria-hidden="true">&#10003;</span>
<h2 class="thanks-screen-title" tabindex="-1">Thank you.</h2>
<p class="thanks-screen-text">${escapeHtml(THANK_YOU_TEXT_BY_ACTION.pray)}</p>
</div>
<div class="thanks-ask">
${renderEyebrow(section.eyebrow)}
${renderTitle(section.heading, 'h2', 'give-title')}
${renderText(section.text, 'give-text')}
${amounts}
${button === '' && skip === '' ? '' : `<div class="give-cta">${button}${skip}</div>`}
</div>
${renderSiteVisit(view)}
</div>
</section>`;
};

const renderInvite = (
  section: SectionContent,
  senderFirstName = '',
): string => {
  const labelTemplate =
    section.inviteButtonLabel === ''
      ? DEFAULT_INVITE_LABEL_TEMPLATE
      : section.inviteButtonLabel;

  return `<section class="invite" id="invite">
<div class="join-card">
<div class="join-copy">
${renderEyebrow(section.eyebrow)}
${renderTitle(section.heading, 'h2', 'join-title')}
${renderText(section.text, 'join-text')}
</div>
<div class="join-form">
<form data-action="invite" novalidate>
<label>Your first name<input name="senderFirstName"${senderFirstName === '' ? '' : ` value="${escapeHtml(senderFirstName)}"`} autocomplete="given-name" maxlength="40"></label>
<label>Your friend's first name<input name="friendFirstName" autocomplete="off" maxlength="40"></label>
<div class="hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
<div class="turnstile-slot"></div>
<button type="submit" data-label-template="${escapeHtml(labelTemplate)}">${escapeHtml(labelTemplate.split('{friend}').join('a friend'))}</button>
<p class="message" role="status"></p>
</form>
<div class="invite-send" hidden>
<button type="button" class="btn btn-secondary btn-xl invite-share">Send</button>
<label class="invite-link-label">Your invite link<input class="invite-link" readonly></label>
<div class="invite-send-actions"><button type="button" class="invite-copy">Copy link</button><a class="invite-email" href="mailto:">Send by email</a></div>
</div>
</div>
</div>
</section>`;
};

export const renderSection = (
  section: SectionContent,
  view: SectionPageView,
): string => {
  switch (section.sectionType) {
    case 'HERO':
      return renderHero(section, view);
    case 'STATS':
      return renderStats(section);
    case 'STORY':
      return renderStory(section, view);
    case 'GIVE':
      return renderGive(section, view);
    case 'QUOTE':
      return renderQuote(section, view);
    case 'JOIN':
    case 'VOLUNTEER':
      return renderFormSection(section, section.sectionType, view);
    case 'THANKS':
      return isFirstOfType(section, view) ? renderThanks(section, view) : '';
    case 'INVITE':
      return isFirstOfType(section, view) ? renderInvite(section) : '';
    default:
      return '';
  }
};

const emptySection = (
  id: string,
  sectionType: SectionType,
): SectionContent => ({
  id,
  sectionType,
  eyebrow: '',
  heading: '',
  text: '',
  photo: null,
  primaryButton: null,
  secondaryButton: null,
  trustLine: '',
  badgeValue: '',
  badgeText: '',
  items: [],
  smallPrint: '',
  inviteMessage: '',
  inviteButtonLabel: '',
});

// A LIVE page without published sections still shows its headline, Give, and Join.
const buildFallbackSections = (view: SectionPageView): SectionContent[] => [
  {
    ...emptySection('fallback-hero', 'HERO'),
    heading: view.title,
    primaryButton: { label: 'Give', action: 'GIVE', url: null },
  },
  emptySection('fallback-join', 'JOIN'),
];

const BRAND_DOT = '<span class="brand-dot" aria-hidden="true"></span>';

// The header button stays navy so it never sits beside a red hero button.
const HEADER_BUTTON_CLASS = 'btn btn-secondary btn-header';

const renderHeader = (view: SectionPageView): string => {
  const mark = isSafeUrl(view.logoUrl)
    ? `<img class="logo" src="${escapeHtml(view.logoUrl)}" alt="">`
    : BRAND_DOT;
  const firstHero = view.sections.find(
    (section) => section.sectionType === 'HERO',
  );
  const headerButton =
    renderButtonWithClasses(
      firstHero?.primaryButton ?? null,
      view,
      HEADER_BUTTON_CLASS,
    ) ||
    renderButtonWithClasses(
      { label: 'Give', action: 'GIVE', url: null },
      view,
      HEADER_BUTTON_CLASS,
    );

  return `<header class="site-header" id="top">
<div class="header-inner">
<a class="brand" href="#top">${mark}<span class="brand-text"><span class="brand-name">${escapeHtml(view.organizationName)}</span>${
    view.tagline === ''
      ? ''
      : `<span class="brand-tagline">${escapeHtml(view.tagline)}</span>`
  }</span></a>
${headerButton}
</div>
</header>`;
};

const renderFooter = (view: SectionPageView): string => {
  const siteLink = isSafeUrl(view.siteUrl)
    ? `<a href="${escapeHtml(view.siteUrl)}" rel="noopener">${escapeHtml(new URL(view.siteUrl).host)}</a>`
    : '';
  const links = [
    siteLink,
    hasSectionType(view, 'GIVE') ? '<a href="#give">Give</a>' : '',
    hasSectionType(view, 'JOIN') ? '<a href="#join">Join</a>' : '',
  ].join('');
  const identity = [view.organizationName, view.mailingAddress]
    .filter((part) => part !== '')
    .map(escapeHtml)
    .join(' · ');

  return `<footer class="site-footer">
<div class="footer-inner">
<span>${identity}</span>
${links === '' ? '' : `<span class="footer-links">${links}</span>`}
</div>
</footer>`;
};

const renderGivePanel = (view: SectionPageView): string => {
  const amounts = view.giveAmounts
    .map(
      (amount) =>
        `<button type="button" class="give-amount" data-amount="${amount}" aria-pressed="false">$${amount}</button>`,
    )
    .join('');
  const givingQuestion = view.givingQuestionEnabled
    ? '\n<button type="button" class="giving-question-trigger" id="giving-question-trigger">Have a giving question? Talk with us</button>'
    : '';

  // Stripe refuses one card payment above its limit, so a larger gift needs a person.
  const overLimitText = view.givingQuestionEnabled
    ? 'For a gift this large, please use the giving question link.'
    : 'Please enter a smaller amount.';

  return `<dialog class="give-panel" id="give-panel" aria-labelledby="give-panel-title">
<form class="give-panel-form" novalidate>
<div class="give-panel-head"><h2 class="give-panel-title" id="give-panel-title">Choose your gift</h2><button type="button" class="give-panel-close" aria-label="Close">&times;</button></div>
<fieldset><legend class="eyebrow">Gift type</legend>
<div class="give-types"><button type="button" class="btn btn-primary give-type" data-gift-type="MONTHLY" aria-pressed="false">Monthly <span class="give-type-tag">Most impact</span></button><button type="button" class="btn btn-outline give-type" data-gift-type="ONE_TIME" aria-pressed="false">One time</button></div>
</fieldset>
<fieldset><legend class="eyebrow">Amount</legend>
<div class="amounts">${amounts}</div>
<label class="give-other">Other amount<input name="otherAmount" type="number" min="${MIN_GIFT_CENTS / 100}" step="1" inputmode="decimal" autocomplete="off"></label>
<span class="give-other-hint">The minimum gift is $${MIN_GIFT_CENTS / 100}.</span>
<span class="give-other-hint give-over-limit" hidden>${overLimitText}</span>
</fieldset>
<button type="submit" class="btn btn-secondary give-continue" disabled>Continue</button>
<p class="message" role="status"></p>${givingQuestion}
</form>
</dialog>`;
};

const GIVING_QUESTION_TRIGGER =
  '<button type="button" class="giving-question-trigger">Have a giving question? Talk with us</button>';

const renderGivingQuestionDialog =
  (): string => `<dialog class="giving-question" id="giving-question-dialog" aria-labelledby="giving-question-title">
<form class="giving-question-form" novalidate>
<div class="give-panel-head"><h2 class="give-panel-title" id="giving-question-title">Have a giving question?</h2><button type="button" class="give-panel-close giving-question-close" aria-label="Close">&times;</button></div>
<label>First name<input name="firstName" autocomplete="given-name"></label>
<label>Last name<input name="lastName" autocomplete="family-name"></label>
<label>Email<input name="email" type="email" required autocomplete="email"></label>
<label>Phone (optional)<input name="phone" type="tel" autocomplete="tel"></label>
<label>Message<textarea name="message" required maxlength="${GIVING_QUESTION_MESSAGE_MAX_LENGTH}" rows="4"></textarea></label>
<div class="hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
<div class="turnstile-slot"></div>
<button type="submit" class="btn btn-secondary giving-question-send">Send</button>
<p class="message" role="status"></p>
</form>
<div class="giving-question-thanks" hidden tabindex="-1"><p class="thanks-title">Thank you. We will contact you soon.</p><button type="button" class="btn btn-outline giving-question-done">Close</button></div>
</dialog>`;

// A separate script, so the page script and its data-action forms stay unchanged.
const GIVING_QUESTION_SCRIPT = `
(function () {
  var config = JSON.parse(document.getElementById('page-config').textContent);
  var dialog = document.getElementById('giving-question-dialog');
  if (!dialog) return;
  var form = dialog.querySelector('form');
  var slot = form.querySelector('.turnstile-slot');
  var message = form.querySelector('.message');
  var thanks = dialog.querySelector('.giving-question-thanks');
  var sendButton = form.querySelector('.giving-question-send');
  var widgetId;
  var waitingForTurnstile = false;
  var trigger = null;

  function renderWidget() {
    if (widgetId !== undefined) return;
    if (!window.turnstile) {
      waitingForTurnstile = true;
      return;
    }
    widgetId = window.turnstile.render(slot, {
      sitekey: config.siteKey,
      'refresh-expired': 'auto',
      retry: 'auto'
    });
  }
  var previousOnLoad = window.onLandingTurnstileLoad;
  window.onLandingTurnstileLoad = function () {
    if (previousOnLoad) previousOnLoad();
    if (waitingForTurnstile) {
      waitingForTurnstile = false;
      renderWidget();
    }
  };
  function resetWidget() {
    if (window.turnstile && widgetId !== undefined) window.turnstile.reset(widgetId);
  }
  function readToken() {
    if (!window.turnstile || widgetId === undefined) return '';
    if (window.turnstile.isExpired(widgetId)) {
      window.turnstile.reset(widgetId);
      return '';
    }
    return window.turnstile.getResponse(widgetId) || '';
  }
  function visitorKey() {
    try {
      return localStorage.getItem('visitor_key') || '';
    } catch (error) {
      return '';
    }
  }
  function showError(text) {
    message.className = 'message error';
    message.textContent = text;
  }

  function open(opener) {
    trigger = opener;
    message.className = 'message';
    message.textContent = '';
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    renderWidget();
    form.querySelector('[name=firstName]').focus();
  }
  function close() {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    if (trigger) trigger.focus();
    trigger = null;
  }

  document.querySelectorAll('.giving-question-trigger').forEach(function (button) {
    button.addEventListener('click', function () { open(button); });
  });
  dialog.querySelector('.giving-question-close').addEventListener('click', close);
  dialog.querySelector('.giving-question-done').addEventListener('click', close);

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    renderWidget();
    var token = readToken();
    if (!token) {
      showError('Please finish the "Verify you are human" check, then send again.');
      return;
    }
    var data = new FormData(form);
    var body = {
      firstName: data.get('firstName'),
      lastName: data.get('lastName'),
      email: data.get('email'),
      phone: data.get('phone'),
      message: data.get('message'),
      website: data.get('website'),
      turnstileToken: token,
      visitorKey: visitorKey()
    };
    if (config.inviteCode) body.inviteCode = config.inviteCode;
    Object.assign(body, config.utm);
    message.textContent = '';
    sendButton.disabled = true;
    fetch(config.base + '/giving-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (json) {
        sendButton.disabled = false;
        if (response.ok) {
          if (window.turnstile && widgetId !== undefined) window.turnstile.remove(widgetId);
          widgetId = undefined;
          form.hidden = true;
          thanks.hidden = false;
          thanks.focus();
          return;
        }
        showError(json.message || 'Something went wrong. Please try again.');
        resetWidget();
      });
    }).catch(function () {
      sendButton.disabled = false;
      showError('Network error. Please try again.');
      resetWidget();
    });
  });
})();
`;

const renderStyles = (): string => `<style>
*{box-sizing:border-box}
html{scroll-padding-top:64px}
body{margin:0;background:#fff;color:#1d1d1f;font-family:Inter,system-ui,sans-serif;font-size:15px;line-height:1.55;overflow-x:hidden;-webkit-font-smoothing:antialiased}
a{color:#1b2b4b}
img{display:block;max-width:100%}
[hidden]{display:none!important}
h1,h2,h3{font-family:'Inter Tight',Inter,system-ui,sans-serif;font-weight:700;letter-spacing:-.02em}
.eyebrow{margin:0;font-size:11px;font-weight:600;letter-spacing:.075em;text-transform:uppercase;color:#6e6e73}
.accent{font-style:normal;color:#e0322d}
.text p{margin:0}.text p+p{margin-top:1em}
.site-header{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.94);border-bottom:1px solid #ececec;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.header-inner{max-width:1120px;margin:0 auto;padding:12px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.brand{display:flex;align-items:center;gap:8px;min-width:0;text-decoration:none;color:#1b2b4b}
.brand-dot{flex:none;width:10px;height:10px;border-radius:50%;background:#e0322d}
.logo{height:28px;width:auto}
.brand-text{display:flex;flex-direction:column;min-width:0;line-height:1.2}
.brand-name{font-family:'Inter Tight',Inter,sans-serif;font-weight:700;font-size:15px;letter-spacing:-.01em}
.brand-tagline{font-size:11px;color:#6e6e73;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.btn{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:999px;font-family:inherit;font-weight:600;line-height:1.2;text-align:center;text-decoration:none;cursor:pointer}
.btn-primary{background:#e0322d;color:#fff}
.btn-primary:hover{background:#c62a25;color:#fff}
.btn-secondary{background:#1b2b4b;color:#fff;border:1px solid #1b2b4b}
.btn-secondary:hover{background:#24375e;border-color:#24375e;color:#fff}
.btn:focus-visible{outline:2px solid #2f6df0;outline-offset:2px}
.btn-header{display:inline-block;flex:0 1 auto;max-width:60%;padding:8px 14px;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.btn-large,.btn-xl{width:100%;padding:14px 18px;font-size:15px}
.photo{overflow:hidden;border-radius:14px;background:#f5f5f7}
.photo-portrait{aspect-ratio:16/10}
.photo-landscape{aspect-ratio:3/2}
.photo-image{width:100%;height:100%;object-fit:cover}
.hero{background:#1b2b4b;color:#fff}
.hero-inner{max-width:1120px;margin:0 auto;padding:28px 22px 30px;display:flex;flex-wrap:wrap;align-items:center;gap:24px}
.hero-copy{flex:1 1 440px;min-width:0;display:flex;flex-direction:column;gap:12px}
.hero .eyebrow{color:#c9d1e3}
.hero-title{margin:0;font-size:30px;line-height:1.1;color:#fff}
.hero-text{font-size:15px;line-height:1.5;color:#c9d1e3}
.actions{display:flex;flex-direction:column;gap:10px;padding-top:8px}
.hero .btn-secondary{background:transparent;border-color:rgba(255,255,255,.35)}
.hero .btn-secondary:hover{background:transparent;border-color:#fff}
.trust{margin:0;font-size:12px;color:#c9d1e3;text-align:center}
.hero-media{flex:1 1 400px;min-width:0;position:relative;margin:6px -22px -30px}
.hero-media .photo{border-radius:0}
.hero-media .badge{position:absolute;left:18px;bottom:18px}
.badge{align-self:flex-start;background:#fff;color:#1d1d1f;border-radius:14px;padding:12px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 1px 3px rgba(0,0,0,.12)}
.badge-value{font-family:'Inter Tight',Inter,sans-serif;font-weight:700;font-size:28px;line-height:1;letter-spacing:-.02em;color:#1b2b4b}
.badge-text{max-width:150px;font-size:13px;line-height:1.35;color:#6e6e73}
.stats-grid{max-width:1120px;margin:0 auto;padding:26px 22px;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:20px}
.stat{display:flex;flex-direction:column;gap:6px}
.stat-value{font-family:'Inter Tight',Inter,sans-serif;font-weight:700;font-size:40px;line-height:1;letter-spacing:-.02em;color:#1b2b4b}
.stat-label{font-size:14px;line-height:1.5;color:#6e6e73}
.story{max-width:1120px;margin:0 auto;padding:26px 22px;display:flex;flex-wrap:wrap-reverse;align-items:center;gap:20px}
.story-media{flex:1 1 440px;min-width:0}
.story-copy{flex:1 1 440px;min-width:0;display:flex;flex-direction:column;gap:10px}
.section-title,.give-title,.join-title{margin:0;font-size:22px;line-height:1.15;color:#1d1d1f}
.story-text,.give-text,.join-text{font-size:14px;line-height:1.55;color:#6e6e73}
.cards{display:grid;gap:10px;margin-top:4px}
.card{background:#fff;border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,.12);padding:14px 16px;display:flex;flex-direction:column;gap:4px}
.card-title{font-weight:600;color:#1d1d1f}
.card-text{font-size:14px;line-height:1.5;color:#6e6e73}
.give{background:#f5f5f7}
.give-inner{max-width:1120px;margin:0 auto;padding:26px 22px;display:flex;flex-direction:column;gap:16px}
.give-head{display:flex;flex-direction:column;gap:10px;max-width:720px}
.tiers{display:grid;gap:10px}
.tier{position:relative;background:#fff;border:2px solid transparent;border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,.12);padding:14px 16px;display:grid;grid-template-columns:auto 1fr;column-gap:14px;row-gap:2px;align-items:center}
.tier-amount{grid-row:span 2;min-width:52px;font-family:'Inter Tight',Inter,sans-serif;font-weight:700;font-size:20px;letter-spacing:-.02em;color:#1b2b4b}
.tier-title{font-weight:600;font-size:14px}
.tier-text{grid-column:2;font-size:14px;line-height:1.45;color:#6e6e73}
.tier-featured{border-color:#1b2b4b}
.tier-flag{position:absolute;top:-10px;right:14px;font-size:11px;font-weight:600;letter-spacing:.075em;text-transform:uppercase;padding:2px 10px;border-radius:999px;background:#1b2b4b;color:#fff}
.give-cta{display:flex;flex-direction:column;align-items:stretch;gap:12px;padding-top:4px}
.small-print{font-size:12px;color:#6e6e73;text-align:center}
.quote-inner{max-width:1120px;margin:0 auto;padding:26px 22px;display:flex;flex-wrap:wrap;align-items:center;gap:20px}
.quote-media{flex:1 1 360px;min-width:0;overflow:hidden;border-radius:14px;aspect-ratio:3/2;background:#f5f5f7}
.quote-photo{width:100%;height:100%;object-fit:cover}
.quote-body{flex:1 1 440px;min-width:0;display:flex;flex-direction:column;gap:10px}
.quote-text{margin:0;font-family:'Inter Tight',Inter,sans-serif;font-weight:600;font-size:17px;line-height:1.4;letter-spacing:-.01em;color:#1d1d1f}
.quote-by{font-size:13px;color:#6e6e73}
.join{background:#f5f5f7}
.join-card{max-width:1120px;margin:0 auto;padding:26px 22px;display:flex;flex-wrap:wrap;gap:20px}
.join-copy{flex:1 1 400px;min-width:0;display:flex;flex-direction:column;gap:10px}
.join-form{flex:1 1 400px;min-width:0}
.join-form form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 10px}
.join-form label{grid-column:1/-1;display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:500;color:#1d1d1f}
.join-form form>label:nth-of-type(-n+2){grid-column:auto}
.join-form input:not([type=checkbox]){width:100%;min-width:0;padding:13px 18px;border-radius:999px;border:1px solid #c7c7cc;background:#fff;color:#1d1d1f;font:inherit;font-size:15px;font-weight:400}
.join-form input:focus-visible{outline:2px solid #2f6df0;outline-offset:1px}
.join-form .check{flex-direction:row;align-items:flex-start;gap:10px;font-size:12px;font-weight:400;line-height:1.5;color:#6e6e73}
.join-form .check input{flex:none;margin-top:2px;accent-color:#1b2b4b}
.hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
.turnstile-slot{grid-column:1/-1}
.join-form button[type=submit]{grid-column:1/-1;padding:14px 18px;border-radius:999px;border:0;background:#1b2b4b;color:#fff;font:inherit;font-weight:600;font-size:15px;cursor:pointer}
.join-form button[type=submit]:hover{background:#24375e}
.join-main .join-form button[type=submit]{background:#e0322d}
.join-main .join-form button[type=submit]:hover{background:#c62a25}
.message{grid-column:1/-1;min-height:1.2em;margin:0;font-size:13px;color:#6e6e73}
.message.error{color:#c62a25}
.thanks{text-align:center;padding:24px 8px}
.thanks:focus{outline:none}
.thanks-title{margin:0 0 8px;font-size:22px;color:#1d1d1f}
.thanks p{margin:0;color:#6e6e73}
.thanks-screen-inner{max-width:1120px;margin:0 auto;padding:30px 22px 26px;display:flex;flex-direction:column;gap:22px}
.thanks-screen-head{display:flex;flex-direction:column;gap:10px}
.thanks-check{width:44px;height:44px;border-radius:50%;background:#11805f;color:#fff;font-weight:700;font-size:22px;display:flex;align-items:center;justify-content:center}
.thanks-screen-title{margin:0;font-size:26px;line-height:1.1;color:#1d1d1f}
.thanks-screen-title:focus{outline:none}
.thanks-screen-text{margin:0;font-size:14px;line-height:1.55;color:#6e6e73}
.thanks-ask{margin:0 -22px;padding:26px 22px;background:#f5f5f7;display:flex;flex-direction:column;gap:10px}
.amounts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:4px 0}
.amount,.give-amount{padding:10px 0;border-radius:999px;border:1px solid #c7c7cc;background:#fff;color:#1b2b4b;font:inherit;font-weight:600;font-size:15px;cursor:pointer}
.amount[aria-pressed=true],.give-amount[aria-pressed=true]{background:#1b2b4b;border-color:#1b2b4b;color:#fff}
.amount:focus-visible,.give-amount:focus-visible,.thanks-skip:focus-visible,.invite-copy:focus-visible,.give-panel-close:focus-visible,.give-other input:focus-visible,.giving-question-trigger:focus-visible{outline:2px solid #2f6df0;outline-offset:2px}
.thanks-skip{align-self:center;padding:4px;border:0;background:none;font:inherit;font-size:13px;color:#6e6e73;text-decoration:underline;cursor:pointer}
.site-visit-link{display:block;padding:11px;border-radius:999px;border:1px solid #c7c7cc;text-align:center;font-size:13px;font-weight:600;text-decoration:none;color:#1b2b4b}
.invite-send{display:flex;flex-direction:column;gap:12px}
.invite-link-label{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:500}
.invite-send-actions{display:flex;gap:10px}
.invite-copy,.invite-email{flex:1;padding:11px;border-radius:999px;border:1px solid #c7c7cc;background:#fff;text-align:center;font:inherit;font-size:13px;font-weight:600;text-decoration:none;color:#1b2b4b;cursor:pointer}
.invite-card{margin:20px 22px 0;background:#fff;color:#1d1d1f;border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,.12);padding:12px 14px;display:flex;align-items:center;gap:12px}
main>.invite-card{margin-bottom:6px}
.invite-card-initial{flex:none;width:36px;height:36px;border-radius:50%;background:#c9d1e3;color:#1b2b4b;font-family:'Inter Tight',Inter,sans-serif;font-weight:700;font-size:15px;display:flex;align-items:center;justify-content:center}
.invite-card-copy{display:flex;flex-direction:column;min-width:0;font-size:14px;line-height:1.4}
.invite-card-description{color:#6e6e73}
.give-panel-open{overflow:hidden}
.give-panel:not([open]){display:none}
.give-panel{width:100%;max-width:100%;max-height:92vh;margin:auto 0 0;padding:0;border:0;border-radius:14px 14px 0 0;overflow:auto;background:#fff;color:#1d1d1f;box-shadow:0 1px 3px rgba(0,0,0,.12)}
.give-panel::backdrop{background:rgba(27,43,75,.6)}
.give-panel-form{display:flex;flex-direction:column;gap:18px;padding:22px}
.give-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.give-panel-title{margin:0;font-size:22px;line-height:1.15;color:#1d1d1f}
.give-panel-close{flex:none;width:36px;height:36px;border-radius:50%;border:1px solid #c7c7cc;background:#fff;color:#1b2b4b;font:inherit;font-size:20px;line-height:1;cursor:pointer}
.give-panel fieldset{min-width:0;margin:0;padding:0;border:0;display:flex;flex-direction:column;gap:8px}
.give-panel legend{padding:0;margin-bottom:8px}
.give-types{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.give-type{flex-direction:column;gap:2px;padding:12px 10px;font-size:15px}
.give-type-tag{font-size:11px;font-weight:600;letter-spacing:.075em;text-transform:uppercase}
.btn-outline{background:#fff;color:#1b2b4b;border:1px solid #c7c7cc}
.btn-outline:hover{border-color:#1b2b4b}
.give-type[aria-pressed=true]{box-shadow:0 0 0 2px #fff,0 0 0 4px #1b2b4b}
.btn-outline[aria-pressed=true]{background:#1b2b4b;border-color:#1b2b4b;color:#fff}
.give-other{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:500;color:#1d1d1f}
.give-other input{width:100%;min-width:0;padding:13px 18px;border-radius:999px;border:1px solid #c7c7cc;background:#fff;color:#1d1d1f;font:inherit;font-size:15px;font-weight:400}
.give-other-hint{font-size:12px;color:#6e6e73}
.give-continue{width:100%;padding:14px 18px;font-size:15px}
.give-continue:disabled{opacity:.45;cursor:not-allowed}
.giving-question:not([open]){display:none}
.giving-question{width:100%;max-width:100%;max-height:92vh;margin:auto 0 0;padding:0;border:0;border-radius:14px 14px 0 0;overflow:auto;background:#fff;color:#1d1d1f;box-shadow:0 1px 3px rgba(0,0,0,.12)}
.giving-question::backdrop{background:rgba(27,43,75,.6)}
.giving-question-form{display:flex;flex-direction:column;gap:14px;padding:22px}
.giving-question label{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:500;color:#1d1d1f}
.giving-question input,.giving-question textarea{width:100%;min-width:0;padding:12px 16px;border-radius:14px;border:1px solid #c7c7cc;background:#fff;color:#1d1d1f;font:inherit;font-size:15px;font-weight:400}
.giving-question input:focus-visible,.giving-question textarea:focus-visible,.giving-question-close:focus-visible{outline:2px solid #2f6df0;outline-offset:1px}
.giving-question-send{width:100%;padding:14px 18px;font-size:15px}
.giving-question-send:disabled{opacity:.45;cursor:not-allowed}
.giving-question-thanks{display:flex;flex-direction:column;align-items:center;gap:12px;padding:32px 22px}
.giving-question-thanks:focus{outline:none}
.giving-question-done{padding:12px 24px;font-size:15px}
.giving-question-trigger{align-self:center;padding:4px;border:0;background:none;font:inherit;font-size:13px;color:#6e6e73;text-decoration:underline;cursor:pointer}
.site-footer{background:#1b2b4b;color:#c9d1e3}
.footer-inner{max-width:1120px;margin:0 auto;padding:20px 22px;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;font-size:12px;line-height:1.6}
.footer-links{display:flex;flex-wrap:wrap;gap:16px}
.footer-links a{color:#fff}
@media (min-width:768px){
.header-inner{padding:14px 24px}
.hero-inner{padding:72px 24px;gap:56px}
.hero-copy{gap:16px}
.hero-title{font-size:40px}
.hero-text{font-size:17px;max-width:520px}
.actions{flex-direction:row;flex-wrap:wrap}
.trust{text-align:left}
.hero-media{margin:0}
.hero-media .photo{border-radius:14px}
.photo-portrait{aspect-ratio:4/5;max-height:560px}
.btn-large,.btn-xl{width:auto;padding:14px 28px}
.btn-xl{min-width:280px}
.stats-grid,.story,.give-inner,.quote-inner,.join-card,.footer-inner,.thanks-screen-inner{padding-left:24px;padding-right:24px}
.thanks-screen-inner{padding-top:56px;padding-bottom:56px}
.thanks-screen-title{font-size:40px}
.thanks-ask{margin:0;border-radius:14px;padding:32px}
.amounts{max-width:420px}
.thanks-ask .give-cta{align-items:flex-start}
.thanks-skip{align-self:flex-start}
.site-visit-link{display:inline-block;padding:11px 24px}
.invite-send{max-width:480px}
.invite-card{max-width:1072px;margin:24px max(24px,calc((100% - 1072px) / 2)) 0}
.stats-grid{padding-top:40px;padding-bottom:40px;gap:32px}
.story,.give-inner,.quote-inner,.join-card{padding-top:56px;padding-bottom:56px;gap:48px}
.section-title,.give-title,.join-title{font-size:30px}
.story-text,.give-text,.join-text{font-size:16px}
.cards{grid-auto-flow:column;grid-auto-columns:minmax(0,1fr)}
.tiers{grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
.give-cta{align-items:flex-start}
.small-print{text-align:left}
.quote-text{font-size:24px}
.join-form button[type=submit]{justify-self:start;padding:14px 28px}
.footer-inner{padding-top:32px;padding-bottom:32px;font-size:13px}
.give-panel{max-width:460px;margin:auto;border-radius:14px}
.give-panel-form{padding:28px}
.giving-question{max-width:460px;margin:auto;border-radius:14px}
.giving-question-form{padding:28px}
}
@media (max-width:420px){
.join-form form>label:nth-of-type(-n+2){grid-column:1/-1}
}
</style>`;

// The preview puts THANKS, then INVITE, where JOIN sits, as the page script does.
const orderForThanksPreview = (view: SectionPageView): SectionContent[] => {
  const join = view.sections.find((section) => section.sectionType === 'JOIN');

  if (!isThanksPreview(view) || join === undefined) {
    return view.sections;
  }

  const moved = ['THANKS', 'INVITE'].flatMap((sectionType) =>
    view.sections.filter((section) => section.sectionType === sectionType),
  );
  const others = view.sections.filter((section) => !moved.includes(section));
  const joinIndex = others.indexOf(join);

  return [...others.slice(0, joinIndex), ...moved, ...others.slice(joinIndex)];
};

const renderPageDocument = (
  view: SectionPageView,
  pageView: SectionPageView,
  main: string,
  extras: { head?: string; script?: string; logsVisit?: boolean } = {},
): string => {
  const extraScript = extras.script ?? '';
  const inviteSection = pageView.sections.find(
    (section) => section.sectionType === 'INVITE',
  );
  const config = buildPageConfig({
    ...view,
    logsVisit: extras.logsVisit,
    inviteMessage:
      inviteSection === undefined || inviteSection.inviteMessage === ''
        ? DEFAULT_INVITE_MESSAGE
        : inviteSection.inviteMessage,
  });
  const title = escapeHtml(view.title);
  const description =
    view.shareDescription === ''
      ? ''
      : `<meta name="description" content="${escapeHtml(view.shareDescription)}">
<meta property="og:description" content="${escapeHtml(view.shareDescription)}">`;
  const shareImage = isSafeUrl(view.shareImageUrl)
    ? `<meta property="og:image" content="${escapeHtml(view.shareImageUrl)}">`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${extras.head ?? ''}<title>${title} | ${escapeHtml(view.organizationName)}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
${description}
${shareImage}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${escapeHtml(FONTS_STYLESHEET_URL)}">
${renderStyles()}
${view.previewMode === true ? '' : TURNSTILE_SCRIPT_TAG}
</head>
<body>
${renderHeader(pageView)}
<main>
${main}
</main>
${renderFooter(pageView)}
${view.giveEnabled && view.previewMode !== true ? `${renderGivePanel(view)}\n` : ''}${view.givingQuestionEnabled && view.previewMode !== true ? `${renderGivingQuestionDialog()}\n` : ''}${
    view.previewMode === true
      ? `<script>${PREVIEW_PAGE_SCRIPT}</script>`
      : `<script type="application/json" id="page-config">${toScriptJson(config)}</script>
<script>${PAGE_SCRIPT}</script>${view.givingQuestionEnabled ? `\n<script>${GIVING_QUESTION_SCRIPT}</script>` : ''}${extraScript === '' ? '' : `\n<script>${extraScript}</script>`}`
  }
</body>
</html>`;
};

export const renderSectionPage = (view: SectionPageView): string => {
  const sections =
    view.sections.length > 0 ? view.sections : buildFallbackSections(view);
  const pageView: SectionPageView = { ...view, sections };
  const leadingInviteCard =
    view.invite !== null && !hasSectionType(pageView, 'HERO')
      ? `${renderInviteCard(view.invite, pageView)}\n`
      : '';

  return renderPageDocument(
    view,
    pageView,
    `${leadingInviteCard}${orderForThanksPreview(pageView)
      .map((section) => renderSection(section, pageView))
      .join('\n')}`,
  );
};

export type GiftThanksView = SectionPageView & {
  firstName: string;
  amountCents: number;
  giftType: 'MONTHLY' | 'ONE_TIME';
  isProcessing?: boolean;
  sessionId: string;
  // Stripe session creation time in epoch seconds.
  created: number;
  now: Date;
};

export const formatGiftAmount = (amountCents: number): string => {
  const isWholeDollars = amountCents % 100 === 0;

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: isWholeDollars ? 0 : 2,
    maximumFractionDigits: isWholeDollars ? 0 : 2,
  }).format(amountCents / 100);
};

const MAKE_MONTHLY_SCRIPT = `
(function () {
  var config = JSON.parse(document.getElementById('page-config').textContent);
  var button = document.querySelector('.make-monthly-button');
  if (!button) return;
  var ask = button.closest('.thanks-ask');
  var message = ask.querySelector('.message');
  function fail(text) {
    button.disabled = false;
    message.className = 'message error';
    message.textContent = text;
  }
  button.addEventListener('click', function () {
    button.disabled = true;
    message.className = 'message';
    message.textContent = '';
    fetch(config.base + '/make-monthly', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: button.getAttribute('data-session-id') })
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (json) {
        if (response.ok && json.status === 'confirm' && typeof json.url === 'string') {
          window.location.href = json.url;
          return;
        }
        if (response.ok && json.status === 'started') {
          button.closest('.give-cta').hidden = true;
          message.textContent = 'You are now a monthly partner.';
          return;
        }
        fail('We could not start the monthly gift. Please try again later.');
      });
    }).catch(function () {
      fail('Network error. Please try again.');
    });
  });
})();
`;

const renderMakeMonthlyAsk = (view: GiftThanksView): string => {
  const amount = escapeHtml(formatGiftAmount(view.amountCents));

  return `<div class="thanks-ask">
<h2 class="give-title">Make it monthly?</h2>
<div class="text give-text"><p>Give ${amount} each month with the same card.</p></div>
<div class="give-cta"><button type="button" class="btn btn-primary btn-xl make-monthly-button" data-session-id="${escapeHtml(view.sessionId)}">Give ${amount} each month</button></div>
<p class="message" role="status"></p>
</div>`;
};

export const renderGiftThanksPage = (view: GiftThanksView): string => {
  const inviteSection =
    view.sections.find((section) => section.sectionType === 'INVITE') ??
    emptySection('gift-thanks-invite', 'INVITE');
  const pageView: SectionPageView = { ...view, sections: [inviteSection] };
  const title =
    view.firstName === ''
      ? 'Thank you.'
      : `Thank you, ${escapeHtml(view.firstName)}.`;
  const giftTypeText = view.giftType === 'MONTHLY' ? 'monthly' : 'one-time';
  const showsMonthlyAsk =
    view.giftType === 'ONE_TIME' &&
    view.isProcessing !== true &&
    Math.floor(view.now.getTime() / 1000) - view.created <=
      MAKE_MONTHLY_WINDOW_SECONDS;

  return renderPageDocument(
    view,
    pageView,
    `<section class="thanks-screen" id="thanks">
<div class="thanks-screen-inner">
<div class="thanks-screen-head">
<span class="thanks-check" aria-hidden="true">&#10003;</span>
<h1 class="thanks-screen-title" tabindex="-1">${title}</h1>
<p class="thanks-screen-text">${
      view.isProcessing === true
        ? 'Your gift is processing. We will email you when it is complete.'
        : `We received your ${giftTypeText} gift of ${escapeHtml(formatGiftAmount(view.amountCents))}.`
    }</p>
</div>
${showsMonthlyAsk ? renderMakeMonthlyAsk(view) : ''}
${renderSiteVisit(view)}${view.givingQuestionEnabled ? `\n${GIVING_QUESTION_TRIGGER}` : ''}
</div>
</section>
${renderInvite(inviteSection, view.firstName)}`,
    {
      // The page URL holds the session id, so it must not leak in a Referer header.
      head: '<meta name="referrer" content="no-referrer">\n',
      script: showsMonthlyAsk ? MAKE_MONTHLY_SCRIPT : '',
      // The donor's landing page visit was already logged.
      logsVisit: false,
    },
  );
};
