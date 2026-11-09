import { describe, expect, it } from 'vitest';

import {
  buildPageConfig,
  markdownToBodyHtml,
  renderLandingPage,
  renderNotFoundPage,
  type LandingPageView,
} from 'src/shared/marketing/landing-page-html';

const view: LandingPageView = {
  slug: 'learn more',
  headline: 'Welcome',
  bodyHtml: '<p>Hello <strong>friend</strong></p>',
  heroImageUrl: null,
  giveLabel: 'Give',
  prayLabel: 'Pray with us',
  volunteerLabel: 'Volunteer',
  organizationName: 'Example Org',
  brandColor: '#112233',
  turnstileSiteKey: 'site-key',
  attribution: {
    network: 'TIKTOK',
    socialPostSlug: 'p1',
    utmRaw: { utm_source: 'tiktok' },
  },
  routeBasePath: '/s/lp',
};

describe('renderLandingPage', () => {
  it('escapes the headline', () => {
    const html = renderLandingPage({
      ...view,
      headline: '<script>alert(1)</script>',
    });

    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert');
  });

  it('allows safe body tags and escapes the rest', () => {
    const html = renderLandingPage({
      ...view,
      bodyHtml:
        '<p>ok</p><img src=x onerror=1><a href="javascript:alert(1)">x</a><a href="https://e.org/a">y</a>',
    });

    expect(html).toContain('<p>ok</p>');
    expect(html).toContain('&lt;img src=x onerror=1&gt;');
    expect(html).not.toContain('javascript:alert(1)">');
    expect(html).toContain('<a href="https://e.org/a"');
  });

  it('omits the Pray form when prayLabel is empty', () => {
    const html = renderLandingPage({ ...view, prayLabel: '' });

    expect(html).not.toContain('data-action="pray"');
    expect(html).toContain('data-action="volunteer"');
  });

  it('includes Turnstile, a hidden honeypot, and an unticked SMS box', () => {
    const html = renderLandingPage(view);

    expect(html).toContain('challenges.cloudflare.com/turnstile');
    expect(html).toContain('name="website"');
    expect(html).toContain('class="hp"');
    const checkbox =
      /<input name="smsConsent" type="checkbox"[^>]*>/.exec(html)?.[0] ?? '';

    expect(checkbox).not.toBe('');
    expect(checkbox).not.toContain('checked');
  });

  it('posts to the visit, pray, volunteer, and give-click routes with an encoded slug', () => {
    const html = renderLandingPage(view);

    expect(html).toContain('/s/lp/learn%20more');
    expect(html).toContain('"base":"/s/lp/learn%20more"');
    expect(html).toContain("beacon('/visit')");
    expect(html).toContain("beacon('/give-click')");
    expect(html).toContain('data-action="pray"');
    expect(html).not.toContain('/s/lp//');
  });

  it('uses the route base without a double slash when it ends with a slash', () => {
    expect(renderLandingPage({ ...view, routeBasePath: '/s/lp/' })).toContain(
      '"base":"/s/lp/learn%20more"',
    );
  });

  it('keeps visitor key in localStorage with a cookie fallback and no inline script breakout', () => {
    const html = renderLandingPage({
      ...view,
      attribution: {
        ...view.attribution,
        utmRaw: { utm_campaign: '</script>' },
      },
    });

    expect(html).toContain('localStorage');
    expect(html).toContain('crypto.randomUUID');
    expect(html).not.toContain('"</script>"');
  });

  it('reads the visitor_key cookie before generating a new key', () => {
    expect(renderLandingPage(view)).toContain('visitor_key=([^;]+)');
  });
});

describe('page script', () => {
  it('shows the server message on an error reply', () => {
    const html = renderLandingPage(view);

    expect(html).toContain(
      "message.textContent = json.message || 'Something went wrong. Please try again.'",
    );
    expect(html).not.toContain('json.error');
  });

  it('tags the Give link with utm_content lp-<slug> and keeps the visit utm values', () => {
    const html = renderLandingPage(view);

    expect(html).toContain(
      '"giveUtm":{"utm_source":"tiktok","utm_content":"lp-learn more"}',
    );
  });

  it('opens the give panel instead of leaving for the Give link', () => {
    const html = renderLandingPage(view);

    expect(html).toContain("document.getElementById('give-panel')");
    expect(html).toContain('openGivePanel(giveButton);');
    expect(html).not.toContain('config.giveUtm');
  });

  it('renders a hidden thank-you panel for each form with its own text', () => {
    const html = renderLandingPage(view);

    expect(html).toContain(
      '<div class="thanks" hidden tabindex="-1"><h3 class="thanks-title">Thank you!</h3><p>We will send you the weekly prayer guide.</p></div>',
    );
    expect(html).toContain(
      '<div class="thanks" hidden tabindex="-1"><h3 class="thanks-title">Thank you!</h3><p>Check your email for the next step.</p></div>',
    );
  });

  it('swaps the form for the thank-you panel on success', () => {
    const html = renderLandingPage(view);

    expect(html).toContain('form.hidden = true;');
    expect(html).toContain('thanks.hidden = false;');
    expect(html).toContain(
      "title.textContent = firstName ? 'Thank you, ' + firstName + '!' : 'Thank you!';",
    );
    expect(html).not.toContain('form.reset();');
  });

  it('resets only the check box of the form that failed', () => {
    const html = renderLandingPage(view);

    expect(html).toContain('window.turnstile.reset(form.widgetId)');
    expect(html).not.toContain('window.turnstile.reset();');
  });

  it('renders each Turnstile widget on first use, not at page load', () => {
    const html = renderLandingPage(view);

    expect(html).toContain(
      'turnstile/v0/api.js?render=explicit&onload=onLandingTurnstileLoad',
    );
    expect(html).toContain('<div class="turnstile-slot"></div>');
    expect(html).not.toContain('class="cf-turnstile"');
    expect(html).toContain("form.addEventListener('focusin'");
    expect(html).toContain('"siteKey":"site-key"');
  });

  it('asks for the human check instead of sending without a fresh token', () => {
    const html = renderLandingPage(view);

    expect(html).toContain('window.turnstile.isExpired(form.widgetId)');
    expect(html).toContain(
      'Please finish the "Verify you are human" check, then send again.',
    );
    expect(html).toContain('turnstileToken: token,');
  });

  it('replaces a visitor utm_content on the Give link', () => {
    const html = renderLandingPage({
      ...view,
      attribution: { ...view.attribution, utmRaw: { utm_content: 'other' } },
    });

    expect(html).toContain('"giveUtm":{"utm_content":"lp-learn more"}');
  });
});

describe('markdownToBodyHtml', () => {
  const render = (markdown: string) =>
    /<div class="body">([\s\S]*?)<\/div>/.exec(
      renderLandingPage({ ...view, bodyHtml: markdownToBodyHtml(markdown) }),
    )?.[1];

  it('splits paragraphs and keeps single line breaks', () => {
    expect(render('One\ntwo\n\nThree')).toBe('<p>One<br>two</p><p>Three</p>');
  });

  it('renders bold and emphasis', () => {
    expect(render('A **bold** and *soft* word')).toBe(
      '<p>A <strong>bold</strong> and <em>soft</em> word</p>',
    );
  });

  it('renders dash and numbered lists', () => {
    expect(render('- one\n- two\n\n1. first\n2. second')).toBe(
      '<ul><li>one</li><li>two</li></ul><ol><li>first</li><li>second</li></ol>',
    );
  });

  it('renders https links', () => {
    expect(render('See [our site](https://example.org/a?b=1&c=2)')).toBe(
      '<p>See <a href="https://example.org/a?b=1&amp;c=2" rel="noopener noreferrer" target="_blank">our site</a></p>',
    );
  });

  it('leaves javascript links and raw script tags as text', () => {
    const html =
      render('[x](javascript:alert(1)) <script>alert(1)</script>') ?? '';

    expect(html).not.toContain('<a');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes ampersands once', () => {
    expect(render('Tom & Jerry')).toBe('<p>Tom &amp; Jerry</p>');
  });
});

describe('renderNotFoundPage', () => {
  it('escapes the organization name', () => {
    expect(renderNotFoundPage('<b>x</b>')).toContain('&lt;b&gt;');
  });
});

describe('buildPageConfig', () => {
  const input = {
    slug: 'feed',
    routeBasePath: '/s/lp',
    turnstileSiteKey: 'site-key',
    attribution: {
      network: 'FACEBOOK' as const,
      socialPostSlug: null,
      utmRaw: { utm_source: 'facebook', utm_term: 'x' },
    },
    inviteCode: null,
    inviteMessage: '{friend}, I want you to see this.',
  };

  it('tags the Give link with the invite code', () => {
    const config = buildPageConfig({ ...input, inviteCode: 'Ab3dE5gH9k' });

    expect(config.giveUtm.utm_term).toBe('inv-Ab3dE5gH9k');
    expect(config.giveUtm.utm_source).toBe('facebook');
    expect(config.inviteCode).toBe('Ab3dE5gH9k');
    expect(config.inviteMessage).toBe('{friend}, I want you to see this.');
  });

  it('leaves utm_term alone without an invite', () => {
    const config = buildPageConfig(input);

    expect(config.giveUtm.utm_term).toBe('x');
    expect(config.inviteCode).toBeNull();
  });
});
