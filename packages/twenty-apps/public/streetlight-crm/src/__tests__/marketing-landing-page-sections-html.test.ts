import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import {
  isMainAsk,
  renderGiftThanksPage,
  renderHeadingWithAccent,
  renderSection,
  renderSectionPage,
  toPageType,
  type SectionPageView,
} from 'src/shared/marketing/landing-page-sections-html';
import type { SectionContent } from 'src/shared/marketing/sections';
import type { SectionType } from 'src/shared/marketing/types';

const HOSTILE = '<script>alert("x")</script>';

const section = (
  sectionType: SectionType,
  overrides: Partial<SectionContent> = {},
): SectionContent => ({
  id: `${sectionType.toLowerCase()}-1`,
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
  ...overrides,
});

const baseView: SectionPageView = {
  slug: 'feed',
  title: 'Feed a Child',
  shareDescription: 'Tonight, $2.50 feeds a child.',
  shareImageUrl: 'https://cdn.example.org/share.jpg',
  organizationName: 'Example Org',
  tagline: 'for the heart of the city',
  logoUrl: null,
  siteUrl: 'https://example.org/about',
  mailingAddress: '1 Main St',
  pageType: null,
  giveEnabled: true,
  giveAmounts: [25, 50, 100],
  givingQuestionEnabled: false,
  turnstileSiteKey: 'site-key',
  attribution: {
    network: 'TIKTOK',
    socialPostSlug: null,
    utmRaw: { utm_source: 'tiktok' },
  },
  routeBasePath: '/s/lp',
  sections: [],
  photoUrls: {},
  invite: null,
  inviteCode: null,
};

const hostileSections: SectionContent[] = [
  section('HERO', {
    eyebrow: HOSTILE,
    heading: HOSTILE,
    text: HOSTILE,
    trustLine: HOSTILE,
    badgeValue: HOSTILE,
    badgeText: HOSTILE,
    primaryButton: { label: HOSTILE, action: 'GIVE', url: null },
    secondaryButton: { label: HOSTILE, action: 'JOIN', url: null },
  }),
  section('STATS', { items: [{ value: HOSTILE, label: HOSTILE }] }),
  section('STORY', {
    eyebrow: HOSTILE,
    heading: HOSTILE,
    text: HOSTILE,
    items: [{ title: HOSTILE, text: HOSTILE }],
  }),
  section('GIVE', {
    eyebrow: HOSTILE,
    heading: HOSTILE,
    text: HOSTILE,
    smallPrint: HOSTILE,
    items: [{ amount: HOSTILE, title: HOSTILE, text: HOSTILE, featured: true }],
    primaryButton: { label: HOSTILE, action: 'GIVE', url: null },
  }),
  section('QUOTE', { heading: HOSTILE, text: HOSTILE }),
  section('JOIN', {
    eyebrow: HOSTILE,
    heading: HOSTILE,
    text: HOSTILE,
    primaryButton: { label: HOSTILE, action: 'JOIN', url: null },
  }),
  section('VOLUNTEER', {
    eyebrow: HOSTILE,
    heading: HOSTILE,
    text: HOSTILE,
    primaryButton: { label: HOSTILE, action: 'VOLUNTEER', url: null },
  }),
  section('THANKS', {
    eyebrow: HOSTILE,
    heading: HOSTILE,
    text: HOSTILE,
    smallPrint: HOSTILE,
    primaryButton: { label: HOSTILE, action: 'GIVE', url: null },
  }),
  section('INVITE', {
    eyebrow: HOSTILE,
    heading: HOSTILE,
    text: HOSTILE,
    inviteButtonLabel: HOSTILE,
  }),
];

describe('renderHeadingWithAccent', () => {
  it('wraps starred text in an accent em', () => {
    expect(renderHeadingWithAccent('Tonight, *$2.50* feeds a child.')).toBe(
      'Tonight, <em class="accent">$2.50</em> feeds a child.',
    );
  });

  it('escapes before adding the accent', () => {
    expect(renderHeadingWithAccent('*<b>*')).toBe(
      '<em class="accent">&lt;b&gt;</em>',
    );
  });

  it('keeps an unmatched star as text', () => {
    expect(renderHeadingWithAccent('5 * 3')).toBe('5 * 3');
  });
});

describe('renderSection', () => {
  const view = { ...baseView, sections: hostileSections };

  it.each(hostileSections.map((content) => [content.sectionType, content]))(
    'escapes every %s field',
    (_type, content) => {
      const html = renderSection(content, view);

      expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)');
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('"x"');
    },
  );

  it('keeps a hostile invite message out of the page config as raw script', () => {
    const html = renderSectionPage({
      ...baseView,
      sections: [
        section('INVITE', {
          inviteMessage: '</script><script>alert(1)</script>',
        }),
      ],
    });
    const configStart = html.indexOf(
      '<script type="application/json" id="page-config">',
    );
    const configBody = html.slice(
      html.indexOf('>', configStart) + 1,
      html.indexOf('</script>', configStart),
    );

    expect(configBody).toContain('alert(1)');
    expect(configBody).not.toContain('</script');
    expect(configBody).not.toContain('<script');
  });

  it('hides empty parts', () => {
    const html = renderSection(section('HERO', { heading: 'Hi' }), baseView);

    expect(html).toContain('Hi');
    expect(html).not.toContain('class="eyebrow');
    expect(html).not.toContain('class="trust');
    expect(html).not.toContain('class="badge');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('class="text');
  });

  it('renders nothing for a STATS section without items', () => {
    expect(renderSection(section('STATS'), baseView)).toBe('');
  });

  it('renders text with paragraphs and line breaks', () => {
    const html = renderSection(
      section('STORY', { text: 'one\ntwo\n\nthree' }),
      baseView,
    );

    expect(html).toContain('<p>one<br>two</p><p>three</p>');
  });

  it('drops a LINK button with a javascript: url', () => {
    const html = renderSection(
      section('HERO', {
        heading: 'Hi',
        primaryButton: {
          label: 'Click',
          action: 'LINK',
          url: 'javascript:alert(1)',
        },
      }),
      baseView,
    );

    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('Click');
  });

  it('renders an https LINK button as an escaped link', () => {
    const html = renderSection(
      section('HERO', {
        heading: 'Hi',
        primaryButton: {
          label: 'Read',
          action: 'LINK',
          url: 'https://example.org/?a=1&b="2"',
        },
      }),
      baseView,
    );

    expect(html).toContain(
      'href="https://example.org/?a=1&amp;b=&quot;2&quot;" rel="noopener"',
    );
  });

  it('renders a GIVE button only when giving is on', () => {
    const hero = section('HERO', {
      heading: 'Hi',
      primaryButton: { label: 'Give now', action: 'GIVE', url: null },
    });

    expect(renderSection(hero, baseView)).toContain(
      '<button type="button" class="btn btn-primary btn-large give-trigger">Give now</button>',
    );
    expect(
      renderSection(hero, { ...baseView, giveEnabled: false }),
    ).not.toContain('Give now');
  });

  it('points JOIN and VOLUNTEER buttons at their form anchors', () => {
    const hero = section('HERO', {
      heading: 'Hi',
      primaryButton: { label: 'Join us', action: 'JOIN', url: null },
      secondaryButton: { label: 'Serve', action: 'VOLUNTEER', url: null },
    });
    const view = {
      ...baseView,
      sections: [hero, section('JOIN'), section('VOLUNTEER')],
    };
    const html = renderSection(hero, view);

    expect(html).toContain('href="#join"');
    expect(html).toContain('href="#volunteer"');
  });

  it('renders the JOIN form with an unchecked SMS box', () => {
    const html = renderSection(
      section('JOIN', {
        heading: 'Pull up a chair',
        primaryButton: { label: 'Join the List', action: 'JOIN', url: null },
      }),
      baseView,
    );

    expect(html).toContain('id="join"');
    expect(html).toContain('data-action="pray"');
    expect(html).toContain('name="smsConsent" type="checkbox"');
    expect(html).not.toContain('checked');
    expect(html).toContain('name="website"');
    expect(html).toContain('class="turnstile-slot"');
    expect(html).toContain('<button type="submit">Join the List</button>');
  });

  it('renders the VOLUNTEER form with the volunteer action', () => {
    const html = renderSection(section('VOLUNTEER'), baseView);

    expect(html).toContain('id="volunteer"');
    expect(html).toContain('data-action="volunteer"');
  });

  it('shows a photo only with an https url', () => {
    const photo = { fileId: 'f1', sourceFileId: 's1', altText: 'A "kid"' };
    const hero = section('HERO', { heading: 'Hi', photo });

    expect(
      renderSection(hero, {
        ...baseView,
        photoUrls: { f1: 'https://files.example.org/f1?t=1&s=2' },
      }),
    ).toContain(
      '<img src="https://files.example.org/f1?t=1&amp;s=2" alt="A &quot;kid&quot;"',
    );
    expect(
      renderSection(hero, {
        ...baseView,
        photoUrls: { f1: 'http://x.org/f1' },
      }),
    ).not.toContain('<img');
  });
});

describe('renderSectionPage', () => {
  it('renders sections in the given order', () => {
    const html = renderSectionPage({
      ...baseView,
      sections: [
        section('QUOTE', { heading: 'First quote' }),
        section('STORY', { heading: 'Second story' }),
        section('HERO', { heading: 'Third hero' }),
      ],
    });

    const first = html.indexOf('First quote');
    const second = html.indexOf('Second story');
    const third = html.indexOf('Third hero');

    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
  });

  it('adds share meta tags from the view', () => {
    const html = renderSectionPage({ ...baseView, title: 'A "big" night' });

    expect(html).toContain(
      '<meta property="og:title" content="A &quot;big&quot; night">',
    );
    expect(html).toContain(
      '<meta property="og:description" content="Tonight, $2.50 feeds a child.">',
    );
    expect(html).toContain(
      '<meta property="og:image" content="https://cdn.example.org/share.jpg">',
    );
  });

  it('leaves out og:image without an https share image', () => {
    const html = renderSectionPage({ ...baseView, shareImageUrl: 'http://x' });

    expect(html).not.toContain('og:image');
  });

  it('uses the red dot without an https logo and the logo image with one', () => {
    expect(renderSectionPage(baseView)).toContain('class="brand-dot"');

    const html = renderSectionPage({
      ...baseView,
      logoUrl: 'https://cdn.example.org/logo.png',
    });

    expect(html).toContain('src="https://cdn.example.org/logo.png"');
    expect(html).not.toContain('class="brand-dot"');
  });

  it('copies the first HERO primary button into the header', () => {
    const html = renderSectionPage({
      ...baseView,
      sections: [
        section('HERO', {
          heading: 'Hi',
          primaryButton: { label: 'Feed a Child', action: 'GIVE', url: null },
        }),
      ],
    });
    const header = html.slice(
      html.indexOf('<header'),
      html.indexOf('</header>'),
    );

    expect(header).toContain('give-trigger');
    expect(header).toContain('Feed a Child');
  });

  it('shows a Give header button without a HERO, and none when giving is off', () => {
    const header = (html: string) =>
      html.slice(html.indexOf('<header'), html.indexOf('</header>'));

    expect(header(renderSectionPage(baseView))).toContain('give-trigger');
    expect(
      header(renderSectionPage({ ...baseView, giveEnabled: false })),
    ).not.toContain('<button');
  });

  it('shows footer links for the site host and present sections', () => {
    const html = renderSectionPage({
      ...baseView,
      sections: [section('GIVE', { heading: 'Give' }), section('JOIN')],
    });
    const footer = html.slice(html.indexOf('<footer'));

    expect(footer).toContain('href="https://example.org/about"');
    expect(footer).toContain('>example.org</a>');
    expect(footer).toContain('href="#give"');
    expect(footer).toContain('href="#join"');
    expect(footer).toContain('Example Org');
    expect(footer).toContain('1 Main St');
  });

  it('falls back to a heading, a Give button, and the JOIN form without sections', () => {
    const html = renderSectionPage({ ...baseView, sections: [] });
    const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));

    expect(main).toContain('Feed a Child');
    expect(main).toContain('give-trigger');
    expect(main).toContain('data-action="pray"');
  });

  it('wires every give trigger to the tagged Give link script', () => {
    const html = renderSectionPage(baseView);

    expect(html).toContain('.give-trigger');
    expect(html).toContain('"utm_content":"lp-feed"');
  });

  it('sends no beacon, loads no Turnstile, and posts no form in preview mode', () => {
    const html = renderSectionPage({
      ...baseView,
      previewMode: true,
      sections: [
        section('HERO', {
          heading: 'Feed',
          primaryButton: { label: 'Give', action: 'GIVE', url: null },
        }),
        section('JOIN'),
      ],
    });

    expect(html).toContain('<form data-action="pray"');
    expect(html).toContain('Forms are off in the preview.');
    expect(html).not.toContain('sendBeacon');
    expect(html).not.toContain('/visit');
    expect(html).not.toContain('challenges.cloudflare.com');
    expect(html).not.toContain('fetch(');
    expect(html).not.toContain('window.location');
  });

  it('keeps the beacon and Turnstile on the public page', () => {
    const html = renderSectionPage({
      ...baseView,
      sections: [section('JOIN')],
    });

    expect(html).toContain('sendBeacon');
    expect(html).toContain('challenges.cloudflare.com');
    expect(html).not.toContain('Forms are off in the preview.');
  });

  it('keeps the preview scroll position across rebuilds through window.name', () => {
    const html = renderSectionPage({ ...baseView, previewMode: true });

    expect(html).toContain('window.name = SCROLL_KEY + window.scrollY');
    expect(html).toContain('window.scrollTo(0, savedScrollY)');
  });
});

describe('Streetlight look', () => {
  const headerOf = (html: string) =>
    html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  const styleOf = (html: string) =>
    html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  const giveHero = section('HERO', {
    heading: 'Hi',
    primaryButton: { label: 'Give now', action: 'GIVE', url: null },
    secondaryButton: { label: 'Join us', action: 'JOIN', url: null },
  });
  const joinHero = section('HERO', {
    heading: 'Hi',
    primaryButton: { label: 'Join us', action: 'JOIN', url: null },
  });
  const giveSection = section('GIVE', {
    heading: 'Give',
    primaryButton: { label: 'Give today', action: 'GIVE', url: null },
  });

  it('loads Inter and Inter Tight only', () => {
    const html = renderSectionPage(baseView);

    expect(html).toContain('family=Inter+Tight');
    expect(html).not.toContain('Source+Serif');
  });

  it('uses the Streetlight colors', () => {
    const style = styleOf(renderSectionPage(baseView));

    expect(style).toContain('#1b2b4b');
    expect(style).toContain('#e0322d');
  });

  it('makes Give red on a One-Step page', () => {
    const view: SectionPageView = {
      ...baseView,
      pageType: 'ONE_STEP',
      sections: [giveHero, section('JOIN')],
    };
    const html = renderSection(giveHero, view);

    expect(html).toContain(
      '<button type="button" class="btn btn-primary btn-large give-trigger">Give now</button>',
    );
    expect(html).toContain(
      '<a class="btn btn-secondary btn-large" href="#join">Join us</a>',
    );
  });

  it('treats a page with no type as One-Step', () => {
    const view: SectionPageView = {
      ...baseView,
      pageType: null,
      sections: [giveHero, section('JOIN')],
    };
    const html = renderSection(giveHero, view);

    expect(html).toContain('class="btn btn-primary btn-large give-trigger"');
    expect(html).toContain('class="btn btn-secondary btn-large" href="#join"');
  });

  it('makes Join red on a Two-Step page', () => {
    const view: SectionPageView = {
      ...baseView,
      pageType: 'TWO_STEP',
      sections: [joinHero, giveSection, section('JOIN')],
    };

    expect(renderSection(joinHero, view)).toContain(
      '<a class="btn btn-primary btn-large" href="#join">Join us</a>',
    );
    expect(renderSection(giveSection, view)).toContain(
      'class="btn btn-secondary btn-xl give-trigger"',
    );
  });

  it('keeps the header button navy', () => {
    for (const pageType of ['ONE_STEP', 'TWO_STEP'] as const) {
      const header = headerOf(
        renderSectionPage({
          ...baseView,
          pageType,
          sections: [giveHero, section('JOIN')],
        }),
      );

      expect(header).toContain(
        'class="btn btn-secondary btn-header give-trigger"',
      );
      expect(header).not.toContain('btn-primary');
    }
  });

  it('shows heading accent in red without italics', () => {
    const html = renderSectionPage({
      ...baseView,
      sections: [section('HERO', { heading: 'Give *$25* tonight' })],
    });

    expect(html).toContain('<em class="accent">$25</em>');
    expect(styleOf(html)).toMatch(/\.accent\{[^}]*font-style:normal/);
  });

  it('marks the main ask by page type', () => {
    expect(isMainAsk('GIVE', 'HERO', null)).toBe(true);
    expect(isMainAsk('JOIN', 'HERO', 'ONE_STEP')).toBe(false);
    expect(isMainAsk('JOIN', 'HERO', 'TWO_STEP')).toBe(true);
    expect(isMainAsk('GIVE', 'GIVE', 'TWO_STEP')).toBe(false);
    expect(isMainAsk('GIVE', 'THANKS', 'TWO_STEP')).toBe(true);
    expect(isMainAsk('LINK', 'HERO', 'ONE_STEP')).toBe(false);
  });

  it('makes the JOIN form red only on a Two-Step page', () => {
    const join = section('JOIN', { heading: 'Join' });
    const render = (pageType: SectionPageView['pageType']) =>
      renderSection(join, { ...baseView, pageType, sections: [join] });

    expect(render('TWO_STEP')).toContain('class="join join-main"');
    expect(render('ONE_STEP')).not.toContain('join-main');
    expect(render(null)).not.toContain('join-main');
  });

  it('uses the navy hover token', () => {
    const html = renderSectionPage(baseView);

    expect(html).toContain('.btn-secondary:hover{background:#24375e');
    expect(html).not.toContain('opacity:.9');
  });

  it('reads only known page types', () => {
    expect(toPageType('TWO_STEP')).toBe('TWO_STEP');
    expect(toPageType('ONE_STEP')).toBe('ONE_STEP');
    expect(toPageType('x')).toBeNull();
    expect(toPageType(null)).toBeNull();
  });
});

describe('THANKS and INVITE', () => {
  const thanksOf = (html: string) =>
    html.slice(
      html.indexOf('<section class="thanks-screen"'),
      html.indexOf(
        '</section>',
        html.indexOf('<section class="thanks-screen"'),
      ),
    );
  const thanks = section('THANKS', {
    heading: 'Will you also give?',
    primaryButton: { label: 'Give', action: 'GIVE', url: null },
    items: [{ amount: '15' }, { amount: '25' }, { amount: '50' }],
    smallPrint: 'No thanks, maybe later',
  });
  const twoStep: SectionPageView = {
    ...baseView,
    pageType: 'TWO_STEP',
    sections: [section('HERO', { heading: 'Pray' }), section('JOIN'), thanks],
  };

  it('hides THANKS until a signup', () => {
    const html = renderSectionPage(twoStep);

    expect(html).toContain(
      '<section class="thanks-screen" id="thanks" hidden>',
    );
    expect(html).toContain('<section class="join join-main" id="join">');
  });

  it('shows THANKS in the preview when asked', () => {
    const html = renderSectionPage({
      ...twoStep,
      previewMode: true,
      previewShowsThanks: true,
    });

    expect(html).toContain('<section class="thanks-screen" id="thanks">');
    expect(html).toContain('<section class="join join-main" id="join" hidden>');
  });

  it('puts THANKS and then INVITE where JOIN sits in the preview', () => {
    const html = renderSectionPage({
      ...twoStep,
      previewMode: true,
      previewShowsThanks: true,
      sections: [
        section('HERO', { heading: 'Pray' }),
        section('JOIN'),
        section('STORY', { heading: 'Later story' }),
        thanks,
        section('INVITE'),
      ],
    });
    const order = [
      '<section class="hero">',
      '<section class="thanks-screen" id="thanks">',
      '<section class="invite" id="invite">',
      'id="join" hidden>',
      'Later story',
    ].map((marker) => html.indexOf(marker));

    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((left, right) => left - right)).toEqual(order);
  });

  it('moves THANKS to the JOIN position after a signup', () => {
    const html = renderSectionPage(twoStep);

    expect(html).toContain(
      'joinSection.parentNode.insertBefore(thanksScreen, joinSection)',
    );
  });

  it('keeps the signup token and the sender name on a page without THANKS', () => {
    const html = renderSectionPage(twoStep);
    const plainThanks = html.slice(
      html.indexOf("if (action === 'pray' && thanksScreen)"),
      html.indexOf("var thanks = form.parentNode.querySelector('.thanks');"),
    );

    expect(plainThanks).toContain(
      "if (action === 'pray') keepInviteSender(firstName, json);",
    );
    expect(html).toContain('function keepInviteSender(firstName, json)');
  });

  it('makes the THANKS Give button red on a Two-Step page', () => {
    expect(thanksOf(renderSectionPage(twoStep))).toContain(
      'class="btn btn-primary btn-xl give-trigger"',
    );
  });

  it('shows the website block and the No thanks button', () => {
    const block = thanksOf(renderSectionPage(twoStep));

    expect(block).toContain('class="site-visit"');
    expect(block).toContain('href="https://example.org/about"');
    expect(block).toContain('Visit example.org');
    expect(block).toContain(
      '<button type="button" class="thanks-skip">No thanks, maybe later</button>',
    );
  });

  it('leaves out the website block without a safe site URL', () => {
    for (const siteUrl of [null, 'javascript:alert(1)', 'http://example.org']) {
      expect(
        thanksOf(renderSectionPage({ ...twoStep, siteUrl })),
      ).not.toContain('site-visit');
    }
  });

  it('leaves out the No thanks button without small print', () => {
    const html = renderSectionPage({
      ...twoStep,
      sections: [section('JOIN'), { ...thanks, smallPrint: '' }],
    });

    expect(html).not.toContain('class="thanks-skip"');
  });

  it('renders amount buttons for THANKS items', () => {
    const block = thanksOf(renderSectionPage(twoStep));

    expect(
      block.match(/<button type="button" class="amount" data-amount="\d+"/g),
    ).toHaveLength(3);
    expect(block).toContain(
      'data-amount="25" aria-pressed="false">$25</button>',
    );
  });

  it('escapes invite names', () => {
    const html = renderSectionPage({
      ...twoStep,
      invite: { senderFirstName: '<b>x</b>', friendFirstName: 'Mike' },
    });

    expect(html).toContain('Mike, &lt;b&gt;x&lt;/b&gt; invited you.');
    expect(html).not.toContain('<b>x</b>');
  });

  it('puts the invite card in the hero', () => {
    const html = renderSectionPage({
      ...twoStep,
      invite: { senderFirstName: 'Sarah', friendFirstName: 'Mike' },
    });
    const hero = html.slice(html.indexOf('<section class="hero">'));

    expect(hero).toMatch(/^<section class="hero">\n<div class="invite-card">/);
    expect(hero).toContain('Mike, Sarah invited you.');
    expect(hero).toContain('Tonight, $2.50 feeds a child.');
  });

  it('leaves out the second card line without a share description', () => {
    const html = renderSectionPage({
      ...twoStep,
      shareDescription: '',
      invite: { senderFirstName: 'Sarah', friendFirstName: 'Mike' },
    });

    expect(html.slice(html.indexOf('<body>'))).not.toContain(
      'invite-card-description',
    );
  });

  it('puts the invite card first without a hero', () => {
    const html = renderSectionPage({
      ...twoStep,
      sections: [section('JOIN'), thanks],
      invite: { senderFirstName: 'Sarah', friendFirstName: 'Mike' },
    });

    expect(html).toMatch(/<main>\n<div class="invite-card">/);
  });

  it('shows no invite card without an invite', () => {
    const html = renderSectionPage(twoStep);

    expect(html.slice(html.indexOf('<body>'))).not.toContain('invite-card');
  });

  it('renders the invite form', () => {
    const invite = section('INVITE', {
      heading: 'Invite a friend',
      inviteButtonLabel: 'Send {friend} this page',
      inviteMessage: '{friend}, look.',
    });
    const html = renderSectionPage({ ...twoStep, sections: [invite] });

    expect(html).toContain('<section class="invite" id="invite">');
    expect(html).toContain('<form data-action="invite" novalidate>');
    expect(html).toContain('name="senderFirstName"');
    expect(html).toContain('name="friendFirstName"');
    expect(html).toContain('name="website"');
    expect(html).toContain('data-label-template="Send {friend} this page"');
    expect(html).toContain('class="invite-send" hidden');
    expect(html).toContain('"inviteMessage":"{friend}, look."');
  });

  it('uses the default invite label template', () => {
    const invite = section('INVITE');
    const html = renderSection(invite, { ...baseView, sections: [invite] });

    expect(html).toContain('data-label-template="Invite {friend}"');
  });

  it('passes the invite code to the page config', () => {
    const html = renderSectionPage({ ...twoStep, inviteCode: 'Ab3dE5gH9k' });

    expect(html).toContain('"inviteCode":"Ab3dE5gH9k"');
    expect(html).toContain('"utm_term":"inv-Ab3dE5gH9k"');
  });
});

// Runs the page script with a stub browser and returns the beacon URLs it sent.
const sentBeacons = (html: string): string[] => {
  const match =
    /<script type="application\/json" id="page-config">([\s\S]*?)<\/script>\n<script>([\s\S]*?)<\/script>/.exec(
      html,
    );

  if (match === null) throw new Error('No page script');

  const [, configJson, pageScript] = match;
  const sent: string[] = [];

  runInNewContext(pageScript, {
    document: {
      cookie: '',
      getElementById: (id: string) =>
        id === 'page-config' ? { textContent: configJson } : null,
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    localStorage: { getItem: () => 'visitor-1', setItem: () => undefined },
    navigator: {
      sendBeacon: (url: string) => {
        sent.push(url);

        return true;
      },
    },
    Blob: class {},
    window: {},
  });

  return sent;
};

describe('visit beacon', () => {
  it('sends a visit from the landing page', () => {
    expect(sentBeacons(renderSectionPage(baseView))).toContain(
      '/s/lp/feed/visit',
    );
  });

  it('sends no visit from the gift thank-you page', () => {
    const html = renderGiftThanksPage({
      ...baseView,
      firstName: 'Ada',
      amountCents: 2500,
      giftType: 'ONE_TIME',
      sessionId: 'cs_test_a1B2c3',
      created: 0,
      now: new Date(0),
    });

    expect(sentBeacons(html).some((url) => url.endsWith('/visit'))).toBe(false);
  });
});

describe('renderGiftThanksPage', () => {
  const thanksView = {
    ...baseView,
    firstName: 'Ada',
    amountCents: 2500,
    giftType: 'ONE_TIME' as const,
    sessionId: 'cs_test_a1B2c3',
    created: Math.floor(Date.parse('2026-11-06T11:00:00Z') / 1000),
    now: new Date('2026-11-06T12:00:00Z'),
  };

  it('thanks the donor by first name with the amount and gift type', () => {
    const html = renderGiftThanksPage(thanksView);

    expect(html).toContain('Thank you, Ada.');
    expect(html).toContain('We received your one-time gift of $25.');
  });

  it('shows cents only when the amount is not whole dollars', () => {
    expect(
      renderGiftThanksPage({ ...thanksView, amountCents: 2550 }),
    ).toContain('$25.50');
    expect(
      renderGiftThanksPage({ ...thanksView, amountCents: 100000 }),
    ).toContain('$1,000.');
  });

  it('says "Thank you." without a first name', () => {
    expect(renderGiftThanksPage({ ...thanksView, firstName: '' })).toContain(
      '>Thank you.<',
    );
  });

  it('escapes the first name', () => {
    const html = renderGiftThanksPage({ ...thanksView, firstName: HOSTILE });

    expect(html).not.toContain(HOSTILE);
    expect(html).toContain('&lt;script&gt;');
  });

  it('shows the monthly ask after a one-time gift', () => {
    const html = renderGiftThanksPage(thanksView);

    expect(html).toContain('Make it monthly?');
    expect(html).toContain('data-session-id="cs_test_a1B2c3"');
    expect(html).toContain("'/make-monthly'");
    expect(html).toContain('You are now a monthly partner.');
  });

  it('shows the monthly ask up to 24 hours after the gift and hides it after', () => {
    const now = new Date('2026-11-06T12:00:00Z');
    const nowSeconds = Math.floor(now.getTime() / 1000);

    expect(
      renderGiftThanksPage({
        ...thanksView,
        now,
        created: nowSeconds - 24 * 60 * 60,
      }),
    ).toContain('Make it monthly?');
    expect(
      renderGiftThanksPage({
        ...thanksView,
        now,
        created: nowSeconds - 24 * 60 * 60 - 1,
      }),
    ).not.toContain('Make it monthly?');
  });

  it('sends no referrer so the session id stays on the page', () => {
    expect(renderGiftThanksPage(thanksView)).toContain(
      '<meta name="referrer" content="no-referrer">',
    );
    expect(renderSectionPage(baseView)).not.toContain('name="referrer"');
  });

  it('shows no monthly ask after a monthly gift', () => {
    const html = renderGiftThanksPage({ ...thanksView, giftType: 'MONTHLY' });

    expect(html).toContain('We received your monthly gift of $25.');
    expect(html).not.toContain('Make it monthly?');
    expect(html).not.toContain('data-session-id');
  });

  it('shows the website block and the invite block with the sender filled in', () => {
    const html = renderGiftThanksPage(thanksView);

    expect(html).toContain('Visit example.org');
    expect(html).toContain('<section class="invite" id="invite">');
    expect(html).toContain('name="senderFirstName" value="Ada"');
  });

  it('uses the page INVITE section when it has one', () => {
    const html = renderGiftThanksPage({
      ...thanksView,
      sections: [section('INVITE', { heading: 'Bring a friend' })],
    });

    expect(html).toContain('Bring a friend');
  });

  it('says the gift is processing and hides the monthly ask while the payment is pending', () => {
    const html = renderGiftThanksPage({ ...thanksView, isProcessing: true });

    expect(html).toContain('Thank you, Ada.');
    expect(html).toContain(
      'Your gift is processing. We will email you when it is complete.',
    );
    expect(html).not.toContain('We received your');
    expect(html).not.toContain('Make it monthly?');
    expect(html).not.toContain('data-session-id');
  });

  it('hides the website block when the site url is empty', () => {
    expect(
      renderGiftThanksPage({ ...thanksView, siteUrl: null }),
    ).not.toContain('class="site-visit"');
  });
});

describe('give panel', () => {
  const panelOf = (html: string) =>
    html.slice(html.indexOf('<dialog'), html.indexOf('</dialog>'));

  it('renders no Give button and no panel when giving is off', () => {
    const html = renderSectionPage({
      ...baseView,
      giveEnabled: false,
      sections: [
        section('HERO', {
          primaryButton: { label: 'Give now', action: 'GIVE', url: null },
        }),
        section('GIVE', {
          primaryButton: { label: 'Give today', action: 'GIVE', url: null },
        }),
      ],
    });

    expect(html).not.toContain('give-trigger"');
    expect(html).not.toContain('<dialog');
  });

  it('shows Give buttons when giving is on', () => {
    const html = renderSectionPage(baseView);

    expect(html).toContain('give-trigger"');
    expect(html).toContain('<dialog');
  });

  it('renders the panel once, however many Give buttons the page has', () => {
    const html = renderSectionPage({
      ...baseView,
      sections: [
        section('HERO', {
          primaryButton: { label: 'Give now', action: 'GIVE', url: null },
        }),
        section('GIVE', {
          primaryButton: { label: 'Give today', action: 'GIVE', url: null },
        }),
      ],
    });

    expect(html.match(/<dialog/g)).toHaveLength(1);
  });

  it('has two unpressed gift type buttons with Monthly as the main ask', () => {
    const panel = panelOf(renderSectionPage(baseView));
    const typeButtons = panel.match(
      /<button[^>]*data-gift-type="[A-Z_]+"[^>]*>/g,
    );

    expect(typeButtons).toHaveLength(2);
    expect(
      typeButtons?.every((button) => button.includes('aria-pressed="false"')),
    ).toBe(true);
    expect(panel).toMatch(
      /<button type="button" class="btn btn-primary give-type" data-gift-type="MONTHLY" aria-pressed="false">Monthly <span class="give-type-tag">Most impact<\/span><\/button>/,
    );
    expect(panel).toContain(
      '<button type="button" class="btn btn-outline give-type" data-gift-type="ONE_TIME" aria-pressed="false">One time</button>',
    );
  });

  it('shows the three page amounts and an Other amount input with no upper limit', () => {
    const panel = panelOf(
      renderSectionPage({ ...baseView, giveAmounts: [10, 35, 250] }),
    );

    expect(panel).toContain(
      '<button type="button" class="give-amount" data-amount="10" aria-pressed="false">$10</button>',
    );
    expect(panel).toContain('data-amount="35"');
    expect(panel).toContain('>$250</button>');
    expect(panel).toContain('Other amount');

    const otherInput =
      panel.match(/<input[^>]*name="otherAmount"[^>]*>/)?.[0] ?? '';

    expect(otherInput).toContain('type="number"');
    expect(otherInput).toContain('min="5"');
    expect(otherInput).toContain('step="1"');
    expect(otherInput).toContain('inputmode="decimal"');
    expect(otherInput).not.toContain('max=');
  });

  it('starts with Continue turned off', () => {
    expect(panelOf(renderSectionPage(baseView))).toMatch(
      /<button type="submit" class="[^"]*give-continue"[^>]*disabled>Continue<\/button>/,
    );
  });

  it('is a labelled dialog with a close button', () => {
    const panel = panelOf(renderSectionPage(baseView));

    expect(panel).toContain(
      '<dialog class="give-panel" id="give-panel" aria-labelledby="give-panel-title">',
    );
    expect(panel).toContain('id="give-panel-title"');
    expect(panel).toContain('class="give-panel-close" aria-label="Close"');
  });

  it('shows the giving question link only when it is turned on', () => {
    expect(panelOf(renderSectionPage(baseView))).not.toContain(
      'giving-question-trigger',
    );
    expect(
      panelOf(renderSectionPage({ ...baseView, givingQuestionEnabled: true })),
    ).toContain(
      '<button type="button" class="giving-question-trigger" id="giving-question-trigger">Have a giving question? Talk with us</button>',
    );
  });

  it('posts the choice to the checkout route and goes to the returned url', () => {
    const html = renderSectionPage(baseView);

    expect(html).toContain("fetch(config.base + '/checkout'");
    expect(html).toContain(
      'body: JSON.stringify({ giftType: giftType, amountCents: amountCents, utm: config.utm, inviteCode: config.inviteCode || null })',
    );
    expect(html).toContain('window.location.href = json.url;');
    expect(html).toContain('We could not start your gift. Please try again.');
  });

  it('sends the Give click beacon when the panel opens', () => {
    const html = renderSectionPage(baseView);
    const openPanel = html.slice(
      html.indexOf('function openGivePanel('),
      html.indexOf('function closeGivePanel('),
    );

    expect(openPanel).toContain("beacon('/give-click');");
    expect(openPanel).toContain('givePanel.showModal()');
  });

  it('preselects a pressed THANKS amount when the panel opens from THANKS', () => {
    const html = renderSectionPage(baseView);
    const openPanel = html.slice(
      html.indexOf('function openGivePanel('),
      html.indexOf('function closeGivePanel('),
    );

    expect(openPanel).toContain("trigger.closest('.thanks-ask')");
    expect(openPanel).toContain('.amount[aria-pressed="true"]');
  });

  it('accepts whole dollars or cents and refuses less than $5', () => {
    const html = renderSectionPage(baseView);

    expect(html).toContain('/^\\d+(\\.\\d{1,2})?$/');
    expect(html).toContain('Math.round(Number(text) * 100)');
    expect(html).toContain('cents < 500');
  });

  it('keeps Continue off while the checkout request is in flight', () => {
    const html = renderSectionPage(baseView);
    const update = html.slice(
      html.indexOf('function updateContinue('),
      html.indexOf('function preselectAmount('),
    );

    expect(update).toContain('continueButton.disabled = submitting ||');
    expect(html).toContain('if (submitting ||');
    expect(html).toContain('submitting = true;');
    expect(html.match(/submitting = false;/g)?.length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it('refuses an amount above the Stripe limit and shows a hint', () => {
    const html = renderSectionPage(baseView);

    expect(html).toContain('cents > 99999999');
    expect(html).toContain('overLimitHint.hidden = cents <= 99999999;');
    expect(panelOf(html)).toContain(
      '<span class="give-other-hint give-over-limit" hidden>Please enter a smaller amount.</span>',
    );
    expect(
      panelOf(renderSectionPage({ ...baseView, givingQuestionEnabled: true })),
    ).toContain(
      '<span class="give-other-hint give-over-limit" hidden>For a gift this large, please use the giving question link.</span>',
    );
  });

  it('opens the panel as a bottom sheet on phones and a dialog from 768px', () => {
    const html = renderSectionPage(baseView);

    expect(html).toContain('.give-panel{');
    expect(html).toMatch(/@media \(min-width:768px\)\{[^@]*\.give-panel\{/);
  });

  it('renders no panel in the preview', () => {
    expect(renderSectionPage({ ...baseView, previewMode: true })).not.toContain(
      '<dialog',
    );
  });

  it('keeps the panel on the gift thank-you page', () => {
    const html = renderGiftThanksPage({
      ...baseView,
      firstName: 'Ada',
      amountCents: 2500,
      giftType: 'MONTHLY',
      sessionId: 'cs_test_a1B2c3',
      created: 0,
      now: new Date(0),
    });

    expect(html.match(/<dialog/g)).toHaveLength(1);
  });
});

describe('giving question dialog', () => {
  const thanksView = {
    ...baseView,
    firstName: 'Ada',
    amountCents: 2500,
    giftType: 'MONTHLY' as const,
    sessionId: 'cs_test_a1B2c3',
    created: Math.floor(Date.parse('2026-11-06T11:00:00Z') / 1000),
    now: new Date('2026-11-06T12:00:00Z'),
  };
  const enabled = { ...baseView, givingQuestionEnabled: true };

  it('is absent when the giving question is off', () => {
    expect(renderSectionPage(baseView)).not.toContain('giving-question-dialog');
    expect(renderGiftThanksPage(thanksView)).not.toContain(
      '<button type="button" class="giving-question-trigger"',
    );
  });

  it('renders a labelled dialog with the form fields and a Turnstile slot', () => {
    const html = renderSectionPage(enabled);
    const dialog = html.slice(html.indexOf('<dialog class="giving-question"'));

    expect(dialog).toContain('id="giving-question-dialog"');
    expect(dialog).toContain('aria-labelledby="giving-question-title"');
    expect(dialog).toContain('name="firstName"');
    expect(dialog).toContain('name="lastName"');
    expect(dialog).toContain('name="email" type="email" required');
    expect(dialog).toContain('name="phone"');
    expect(dialog).toMatch(/<textarea name="message"[^>]*maxlength="1000"/);
    expect(dialog).toContain('name="website"');
    expect(dialog).toContain('turnstile-slot');
    expect(dialog).toContain('Thank you. We will contact you soon.');
  });

  it('is not a data-action form, so the page script does not take it over', () => {
    expect(renderSectionPage(enabled)).not.toMatch(
      /<form[^>]*giving-question[^>]*data-action/,
    );
  });

  it('posts to the giving-question route', () => {
    expect(renderSectionPage(enabled)).toContain(
      "config.base + '/giving-question'",
    );
  });

  it('puts the trigger on the gift thank-you page', () => {
    const html = renderGiftThanksPage({
      ...thanksView,
      givingQuestionEnabled: true,
    });

    expect(html).toContain('Have a giving question? Talk with us');
    expect(html).toContain('id="giving-question-dialog"');
  });

  it('keeps one element with the trigger id', () => {
    const html = renderGiftThanksPage({
      ...thanksView,
      givingQuestionEnabled: true,
    });

    expect(html.match(/id="giving-question-trigger"/g) ?? []).toHaveLength(
      html.includes('id="give-panel"') ? 1 : 0,
    );
  });
});
