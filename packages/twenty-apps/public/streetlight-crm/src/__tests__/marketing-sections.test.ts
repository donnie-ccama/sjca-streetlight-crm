import { describe, expect, it } from 'vitest';

import {
  buildPublishedContent,
  DEFAULT_GIVE_AMOUNTS,
  DEFAULT_INVITE_MESSAGE,
  draftDiffersFromPublished,
  MAX_ITEMS_BY_TYPE,
  MAX_SECTIONS,
  parseGiveAmounts,
  parseItems,
  parsePublishedContent,
  toSectionContent,
  type LandingPageSectionRecord,
} from 'src/shared/marketing/sections';

const makeRecord = (
  overrides: Partial<LandingPageSectionRecord> = {},
): LandingPageSectionRecord => ({
  id: 'section-1',
  sectionType: 'HERO',
  position: 0,
  isVisible: true,
  eyebrow: null,
  heading: 'Feed a *child*',
  text: null,
  photo: null,
  primaryButtonLabel: null,
  primaryButtonAction: null,
  primaryButtonUrl: null,
  secondaryButtonLabel: null,
  secondaryButtonAction: null,
  secondaryButtonUrl: null,
  trustLine: null,
  badgeValue: null,
  badgeText: null,
  items: null,
  smallPrint: null,
  inviteMessage: null,
  ...overrides,
});

describe('MAX_ITEMS_BY_TYPE', () => {
  it('limits items by section type', () => {
    expect(MAX_ITEMS_BY_TYPE).toEqual({
      HERO: 0,
      STATS: 4,
      STORY: 3,
      GIVE: 6,
      QUOTE: 0,
      JOIN: 0,
      VOLUNTEER: 0,
      THANKS: 3,
      INVITE: 0,
    });
  });
});

describe('parseItems', () => {
  it('gives an empty list for a value that is not an array', () => {
    expect(parseItems('STATS', 'nope')).toEqual([]);
  });

  it('keeps at most four stats', () => {
    const raw = Array.from({ length: 5 }, (_, index) => ({
      value: `${index}`,
      label: 'meals',
    }));

    expect(parseItems('STATS', raw)).toHaveLength(4);
  });

  it('drops a story item without a title', () => {
    expect(
      parseItems('STORY', [
        { text: 'no title' },
        { title: 'Kept', text: 'body' },
      ]),
    ).toEqual([{ title: 'Kept', text: 'body' }]);
  });

  it('reads featured as true only for true', () => {
    const items = parseItems('GIVE', [
      { amount: '$10', title: 'a', text: '', featured: 'true' },
      { amount: '$20', title: 'b', text: '', featured: true },
      { amount: '$30', title: 'c', text: '' },
    ]);

    expect(
      items.map((item) => (item as { featured: boolean }).featured),
    ).toEqual([false, true, false]);
  });

  it('gives no items for types that do not use them', () => {
    expect(parseItems('HERO', [{ value: '1', label: 'x' }])).toEqual([]);
  });
});

describe('toSectionContent', () => {
  it('turns a blank field into an empty string', () => {
    const content = toSectionContent(makeRecord(), null);

    expect(content.eyebrow).toBe('');
    expect(content.heading).toBe('Feed a *child*');
    expect(content.photo).toBeNull();
    expect(content.primaryButton).toBeNull();
  });

  it('drops a LINK button whose URL is not https', () => {
    const content = toSectionContent(
      makeRecord({
        primaryButtonLabel: 'Go',
        primaryButtonAction: 'LINK',
        primaryButtonUrl: { primaryLinkUrl: 'http://example.org' },
      }),
      null,
    );

    expect(content.primaryButton).toBeNull();
  });

  it('keeps a LINK button with an https URL', () => {
    const content = toSectionContent(
      makeRecord({
        primaryButtonLabel: 'Go',
        primaryButtonAction: 'LINK',
        primaryButtonUrl: { primaryLinkUrl: 'https://example.org' },
      }),
      null,
    );

    expect(content.primaryButton).toEqual({
      label: 'Go',
      action: 'LINK',
      url: 'https://example.org',
    });
  });

  it('ignores the URL on a non-LINK button', () => {
    const content = toSectionContent(
      makeRecord({
        primaryButtonLabel: 'Give',
        primaryButtonAction: 'GIVE',
        primaryButtonUrl: { primaryLinkUrl: 'https://example.org' },
      }),
      null,
    );

    expect(content.primaryButton).toEqual({
      label: 'Give',
      action: 'GIVE',
      url: null,
    });
  });

  it('drops a button without a label', () => {
    const content = toSectionContent(
      makeRecord({ primaryButtonAction: 'GIVE' }),
      null,
    );

    expect(content.primaryButton).toBeNull();
  });
});

describe('buildPublishedContent', () => {
  it('skips hidden sections and sorts by position', () => {
    const content = buildPublishedContent(
      [
        makeRecord({ id: 'c', position: 3 }),
        makeRecord({ id: 'hidden', position: 1, isVisible: false }),
        makeRecord({ id: 'a', position: 0 }),
        makeRecord({ id: 'b', position: 2 }),
      ],
      new Map(),
    );

    expect(content.version).toBe(1);
    expect(content.sections.map((section) => section.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('keeps only the first JOIN and the first VOLUNTEER', () => {
    const content = buildPublishedContent(
      [
        makeRecord({ id: 'join-2', sectionType: 'JOIN', position: 2 }),
        makeRecord({ id: 'join-1', sectionType: 'JOIN', position: 1 }),
        makeRecord({ id: 'vol-1', sectionType: 'VOLUNTEER', position: 3 }),
        makeRecord({ id: 'vol-2', sectionType: 'VOLUNTEER', position: 4 }),
      ],
      new Map(),
    );

    expect(content.sections.map((section) => section.id)).toEqual([
      'join-1',
      'vol-1',
    ]);
  });

  it('does not count a hidden JOIN as the first one', () => {
    const content = buildPublishedContent(
      [
        makeRecord({
          id: 'hidden',
          sectionType: 'JOIN',
          position: 0,
          isVisible: false,
        }),
        makeRecord({ id: 'shown', sectionType: 'JOIN', position: 1 }),
      ],
      new Map(),
    );

    expect(content.sections.map((section) => section.id)).toEqual(['shown']);
  });

  it('attaches the photo for each section id', () => {
    const photo = { fileId: 'copy', sourceFileId: 'draft', altText: 'Kids' };
    const content = buildPublishedContent(
      [makeRecord({ id: 'a' })],
      new Map([['a', photo]]),
    );

    expect(content.sections[0].photo).toEqual(photo);
  });
});

describe('parsePublishedContent', () => {
  it('gives null for a wrong version', () => {
    expect(parsePublishedContent({ version: 2, sections: [] })).toBeNull();
  });

  it('gives null for a value that is not an object', () => {
    expect(parsePublishedContent('nope')).toBeNull();
    expect(parsePublishedContent(null)).toBeNull();
  });

  it('round-trips built content', () => {
    const built = buildPublishedContent(
      [
        makeRecord({
          sectionType: 'STATS',
          items: [{ value: '1', label: 'meal' }],
        }),
      ],
      new Map(),
    );

    expect(parsePublishedContent(JSON.parse(JSON.stringify(built)))).toEqual(
      built,
    );
  });

  it('round-trips the page fields', () => {
    const built = buildPublishedContent([makeRecord()], new Map(), {
      title: 'Feed a child',
      shareDescription: 'Share me',
      shareImage: { fileId: 'copy', sourceFileId: 'draft', altText: 'Kids' },
    });

    expect(
      parsePublishedContent(JSON.parse(JSON.stringify(built)))?.page,
    ).toEqual({
      title: 'Feed a child',
      shareDescription: 'Share me',
      shareImage: { fileId: 'copy', sourceFileId: 'draft', altText: 'Kids' },
    });
  });

  it('reads legacy content without page fields as empty page fields', () => {
    expect(parsePublishedContent({ version: 1, sections: [] })).toEqual({
      version: 1,
      page: { title: '', shareDescription: '', shareImage: null },
      sections: [],
    });
  });

  it('gives null when a section has an unknown type', () => {
    expect(
      parsePublishedContent({
        version: 1,
        sections: [{ id: 'x', sectionType: 'NOPE' }],
      }),
    ).toBeNull();
  });
});

describe('draftDiffersFromPublished', () => {
  const page = {
    title: 'Feed',
    shareDescription: 'Share',
    shareImageFileId: null,
  };
  const publishedPage = {
    title: 'Feed',
    shareDescription: 'Share',
    shareImage: null,
  };
  const records = [
    makeRecord({ id: 'a', position: 0 }),
    makeRecord({ id: 'b', position: 1, sectionType: 'QUOTE' }),
  ];

  it('is false right after publishing the same records', () => {
    const published = buildPublishedContent(records, new Map(), publishedPage);

    expect(draftDiffersFromPublished(records, published, page)).toBe(false);
  });

  it('is true after a heading change', () => {
    const published = buildPublishedContent(records, new Map(), publishedPage);
    const edited = [{ ...records[0], heading: 'Changed' }, records[1]];

    expect(draftDiffersFromPublished(edited, published, page)).toBe(true);
  });

  it('sees an invite message change as unpublished', () => {
    const invites = [
      makeRecord({ id: 'i', sectionType: 'INVITE', inviteMessage: 'Hi' }),
    ];
    const published = buildPublishedContent(invites, new Map(), publishedPage);
    const edited = [{ ...invites[0], inviteMessage: 'Hello' }];

    expect(draftDiffersFromPublished(invites, published, page)).toBe(false);
    expect(draftDiffersFromPublished(edited, published, page)).toBe(true);
  });

  it('is true after a visibility change', () => {
    const published = buildPublishedContent(records, new Map(), publishedPage);
    const edited = [records[0], { ...records[1], isVisible: false }];

    expect(draftDiffersFromPublished(edited, published, page)).toBe(true);
  });

  it('is true when the draft photo is not the published source', () => {
    const photo = { fileId: 'copy', sourceFileId: 'draft-1', altText: 'Kids' };
    const withPhoto = [
      makeRecord({ id: 'a', photo: [{ fileId: 'draft-1', label: 'Kids' }] }),
    ];
    const published = buildPublishedContent(
      withPhoto,
      new Map([['a', photo]]),
      publishedPage,
    );

    expect(draftDiffersFromPublished(withPhoto, published, page)).toBe(false);
    expect(
      draftDiffersFromPublished(
        [
          makeRecord({
            id: 'a',
            photo: [{ fileId: 'draft-2', label: 'Kids' }],
          }),
        ],
        published,
        page,
      ),
    ).toBe(true);
  });

  it('is true when nothing is published yet and a section is visible', () => {
    expect(draftDiffersFromPublished(records, null, page)).toBe(true);
    expect(draftDiffersFromPublished([], null, page)).toBe(false);
  });

  it('is true after a title, share text, or share image change', () => {
    const published = buildPublishedContent(records, new Map(), {
      ...publishedPage,
      shareImage: { fileId: 'copy', sourceFileId: 'share-1', altText: '' },
    });
    const withImage = { ...page, shareImageFileId: 'share-1' };

    expect(draftDiffersFromPublished(records, published, withImage)).toBe(
      false,
    );
    expect(
      draftDiffersFromPublished(records, published, {
        ...withImage,
        title: 'New',
      }),
    ).toBe(true);
    expect(
      draftDiffersFromPublished(records, published, {
        ...withImage,
        shareDescription: 'New',
      }),
    ).toBe(true);
    expect(
      draftDiffersFromPublished(records, published, {
        ...withImage,
        shareImageFileId: 'share-2',
      }),
    ).toBe(true);
    expect(
      draftDiffersFromPublished(records, published, {
        ...withImage,
        shareImageFileId: null,
      }),
    ).toBe(true);
  });
});

describe('length caps', () => {
  const long = (length: number) => 'x'.repeat(length + 50);

  it('truncates record text fields to their caps', () => {
    const content = toSectionContent(
      makeRecord({
        id: long(64),
        eyebrow: long(200),
        heading: long(300),
        text: long(4000),
        trustLine: long(200),
        badgeValue: long(200),
        badgeText: long(200),
        smallPrint: long(200),
        primaryButtonLabel: long(200),
        primaryButtonAction: 'GIVE',
      }),
      null,
    );

    expect(content.id).toHaveLength(64);
    expect(content.eyebrow).toHaveLength(200);
    expect(content.heading).toHaveLength(300);
    expect(content.text).toHaveLength(4000);
    expect(content.trustLine).toHaveLength(200);
    expect(content.badgeValue).toHaveLength(200);
    expect(content.badgeText).toHaveLength(200);
    expect(content.smallPrint).toHaveLength(200);
    expect(content.primaryButton?.label).toHaveLength(200);
  });

  it('truncates item fields to 200', () => {
    const [item] = parseItems('GIVE', [
      { amount: long(200), title: long(200), text: long(200) },
    ]) as { amount: string; title: string; text: string }[];

    expect(item.amount).toHaveLength(200);
    expect(item.title).toHaveLength(200);
    expect(item.text).toHaveLength(200);
  });

  it('drops a LINK url past 2048 characters', () => {
    const content = toSectionContent(
      makeRecord({
        primaryButtonLabel: 'Go',
        primaryButtonAction: 'LINK',
        primaryButtonUrl: { primaryLinkUrl: `https://a.org/${long(2048)}` },
      }),
      null,
    );

    expect(content.primaryButton).toBeNull();
  });

  it('truncates published photo ids and alt text, and caps sections', () => {
    const parsed = parsePublishedContent({
      version: 1,
      sections: Array.from({ length: MAX_SECTIONS + 5 }, (_, index) => ({
        id: index === 0 ? long(64) : `s${index}`,
        sectionType: 'HERO',
        photo: {
          fileId: long(64),
          sourceFileId: long(64),
          altText: long(200),
        },
        heading: long(300),
        text: long(4000),
      })),
    });

    expect(parsed?.sections).toHaveLength(MAX_SECTIONS);
    expect(parsed?.sections[0].id).toHaveLength(64);
    expect(parsed?.sections[0].photo?.fileId).toHaveLength(64);
    expect(parsed?.sections[0].photo?.sourceFileId).toHaveLength(64);
    expect(parsed?.sections[0].photo?.altText).toHaveLength(200);
    expect(parsed?.sections[0].heading).toHaveLength(300);
    expect(parsed?.sections[0].text).toHaveLength(4000);
  });

  it('caps built sections', () => {
    const records = Array.from({ length: MAX_SECTIONS + 5 }, (_, index) =>
      makeRecord({ id: `s${index}`, position: index, sectionType: 'QUOTE' }),
    );

    expect(buildPublishedContent(records, new Map()).sections).toHaveLength(
      MAX_SECTIONS,
    );
  });
});

describe('link validation', () => {
  const linkButton = (url: string) =>
    toSectionContent(
      makeRecord({
        primaryButtonLabel: 'Go',
        primaryButtonAction: 'LINK',
        primaryButtonUrl: { primaryLinkUrl: url },
      }),
      null,
    ).primaryButton;

  it('rejects a bare scheme and a url with whitespace', () => {
    expect(linkButton('https://')).toBeNull();
    expect(linkButton('https://a b')).toBeNull();
  });

  it('accepts an uppercase scheme', () => {
    expect(linkButton('HTTPS://x.org')).toEqual({
      label: 'Go',
      action: 'LINK',
      url: 'HTTPS://x.org',
    });
  });
});

describe('ordering and type rules', () => {
  it('breaks position ties by id', () => {
    const content = buildPublishedContent(
      [
        makeRecord({ id: 'b', position: 1, sectionType: 'QUOTE' }),
        makeRecord({ id: 'a', position: 1, sectionType: 'QUOTE' }),
      ],
      new Map(),
    );

    expect(content.sections.map((section) => section.id)).toEqual(['a', 'b']);
  });

  const stray = {
    secondaryButtonLabel: 'More',
    secondaryButtonAction: 'GIVE' as const,
    trustLine: 'trust',
    badgeValue: '1',
    badgeText: 'badge',
  };
  const photo = { fileId: 'c', sourceFileId: 'd', altText: 'alt' };

  it('keeps hero-only fields for HERO', () => {
    const content = toSectionContent(makeRecord(stray), photo);

    expect(content.secondaryButton).not.toBeNull();
    expect(content.trustLine).toBe('trust');
    expect(content.badgeValue).toBe('1');
    expect(content.badgeText).toBe('badge');
    expect(content.photo).toEqual(photo);
  });

  it('clears hero-only fields and photo for other types', () => {
    const content = toSectionContent(
      makeRecord({ ...stray, sectionType: 'STATS' }),
      photo,
    );

    expect(content.secondaryButton).toBeNull();
    expect(content.trustLine).toBe('');
    expect(content.badgeValue).toBe('');
    expect(content.badgeText).toBe('');
    expect(content.photo).toBeNull();
  });

  it('keeps photo for STORY and QUOTE only besides HERO', () => {
    for (const sectionType of ['STORY', 'QUOTE'] as const) {
      expect(
        toSectionContent(makeRecord({ sectionType }), photo).photo,
      ).toEqual(photo);
    }
    for (const sectionType of ['GIVE', 'JOIN', 'VOLUNTEER'] as const) {
      expect(
        toSectionContent(makeRecord({ sectionType }), photo).photo,
      ).toBeNull();
    }
  });

  it('applies the same rules when parsing published content', () => {
    const parsed = parsePublishedContent({
      version: 1,
      sections: [{ id: 'x', sectionType: 'GIVE', photo, trustLine: 't' }],
    });

    expect(parsed?.sections[0].photo).toBeNull();
    expect(parsed?.sections[0].trustLine).toBe('');
  });
});

describe('THANKS and INVITE rules', () => {
  const giveButton = {
    primaryButtonLabel: 'Give',
    primaryButtonUrl: null,
  };

  it('keeps a THANKS button only when it gives', () => {
    const joins = toSectionContent(
      makeRecord({
        sectionType: 'THANKS',
        ...giveButton,
        primaryButtonAction: 'JOIN',
      }),
      null,
    );
    const gives = toSectionContent(
      makeRecord({
        sectionType: 'THANKS',
        ...giveButton,
        primaryButtonAction: 'GIVE',
      }),
      null,
    );

    expect(joins.primaryButton).toBeNull();
    expect(gives.primaryButton).toEqual({
      label: 'Give',
      action: 'GIVE',
      url: null,
    });
  });

  it('keeps up to three whole-dollar THANKS amounts', () => {
    const content = toSectionContent(
      makeRecord({
        sectionType: 'THANKS',
        items: [
          { amount: '15' },
          { amount: '2.5' },
          { amount: '25' },
          { amount: '50' },
          { amount: '100' },
        ],
      }),
      null,
    );

    expect(content.items).toEqual([
      { amount: '15' },
      { amount: '25' },
      { amount: '50' },
    ]);
  });

  it('reads the INVITE label and message', () => {
    const content = toSectionContent(
      makeRecord({
        sectionType: 'INVITE',
        primaryButtonLabel: 'Invite {friend}',
        primaryButtonAction: 'GIVE',
        inviteMessage: '',
      }),
      null,
    );

    expect(content.inviteButtonLabel).toBe('Invite {friend}');
    expect(content.inviteMessage).toBe(DEFAULT_INVITE_MESSAGE);
    expect(content.primaryButton).toBeNull();
  });

  it('cuts an invite message at 300 characters', () => {
    const content = toSectionContent(
      makeRecord({ sectionType: 'INVITE', inviteMessage: 'a'.repeat(400) }),
      null,
    );

    expect(content.inviteMessage).toBe('a'.repeat(300));
  });

  it('clears invite fields on other types', () => {
    const content = toSectionContent(
      makeRecord({
        sectionType: 'STORY',
        text: 'Some text',
        primaryButtonLabel: 'Label',
        inviteMessage: 'Hi',
      }),
      null,
    );

    expect(content.inviteMessage).toBe('');
    expect(content.inviteButtonLabel).toBe('');
  });

  it('parses content published before invites', () => {
    const parsed = parsePublishedContent({
      version: 1,
      sections: [{ id: 's1', sectionType: 'STORY' }],
    });

    expect(parsed?.sections[0].inviteMessage).toBe('');
    expect(parsed?.sections[0].inviteButtonLabel).toBe('');
  });

  it('allows one THANKS and one INVITE', () => {
    const content = buildPublishedContent(
      [
        makeRecord({ id: 't1', sectionType: 'THANKS', position: 1 }),
        makeRecord({ id: 't2', sectionType: 'THANKS', position: 2 }),
        makeRecord({ id: 'i1', sectionType: 'INVITE', position: 3 }),
        makeRecord({ id: 'i2', sectionType: 'INVITE', position: 4 }),
      ],
      new Map(),
    );

    expect(content.sections.map((section) => section.id)).toEqual(['t1', 'i1']);
  });

  it('round-trips THANKS and INVITE through published content', () => {
    const content = buildPublishedContent(
      [
        makeRecord({
          id: 't',
          sectionType: 'THANKS',
          position: 1,
          primaryButtonLabel: 'Give again',
          primaryButtonAction: 'GIVE',
          items: [{ amount: '15' }, { amount: '25' }, { amount: '50' }],
        }),
        makeRecord({
          id: 'i',
          sectionType: 'INVITE',
          position: 2,
          primaryButtonLabel: 'Invite {friend}',
          inviteMessage: 'Hi {friend}',
        }),
      ],
      new Map(),
    );
    const parsed = parsePublishedContent(JSON.parse(JSON.stringify(content)));

    expect(parsed?.sections).toEqual(content.sections);
    expect(parsed?.sections.map((section) => section.id)).toEqual(['t', 'i']);
    expect(parsed?.sections[0].items).toHaveLength(3);
    expect(parsed?.sections[1].inviteMessage).toBe('Hi {friend}');
  });
});

describe('parseGiveAmounts', () => {
  it('reads three whole dollar amounts', () => {
    expect(parseGiveAmounts('10, 20,30')).toEqual([10, 20, 30]);
  });

  it('falls back to the defaults for anything else', () => {
    expect(DEFAULT_GIVE_AMOUNTS).toEqual([25, 50, 100]);
    for (const raw of [
      null,
      '',
      '2,3,4',
      'a,b',
      '10,20',
      '10,20,30,40',
      '10.5,20,30',
    ]) {
      expect(parseGiveAmounts(raw)).toEqual([25, 50, 100]);
    }
  });
});
