import type { ButtonAction, SectionType } from 'src/shared/marketing/types';

export type SectionButton = {
  label: string;
  action: ButtonAction;
  url: string | null;
};

export type StatItem = { value: string; label: string };
export type CardItem = { title: string; text: string };
export type TierItem = {
  amount: string;
  title: string;
  text: string;
  featured: boolean;
};

export type AmountItem = { amount: string };

export type PublishedPhoto = {
  // fileId of the copy in Landing Page.publishedPhotos
  fileId: string;
  // fileId of the draft photo it was copied from (reuse check)
  sourceFileId: string;
  altText: string;
};

export type SectionContent = {
  id: string;
  sectionType: SectionType;
  eyebrow: string;
  heading: string;
  text: string;
  photo: PublishedPhoto | null;
  primaryButton: SectionButton | null;
  secondaryButton: SectionButton | null;
  trustLine: string;
  badgeValue: string;
  badgeText: string;
  items: StatItem[] | CardItem[] | TierItem[] | AmountItem[];
  smallPrint: string;
  inviteMessage: string;
  inviteButtonLabel: string;
};

export type PublishedPage = {
  title: string;
  shareDescription: string;
  shareImage: PublishedPhoto | null;
};

export type PublishedContent = {
  version: 1;
  page: PublishedPage;
  sections: SectionContent[];
};

// The page fields as staff edit them; the share image compares by its draft file id.
export type DraftPageFields = {
  title: string;
  shareDescription: string;
  shareImageFileId: string | null;
};

export const EMPTY_PUBLISHED_PAGE: PublishedPage = {
  title: '',
  shareDescription: '',
  shareImage: null,
};

type SectionButtonFields = {
  label: string | null;
  action: ButtonAction | null;
  url: { primaryLinkUrl: string | null } | null;
};

// A section as read through the workspace GraphQL API.
export type LandingPageSectionRecord = {
  id: string;
  sectionType: SectionType;
  position: number | null;
  isVisible: boolean | null;
  eyebrow: string | null;
  heading: string | null;
  text: string | null;
  photo: { fileId: string; label: string; url?: string }[] | null;
  primaryButtonLabel: SectionButtonFields['label'];
  primaryButtonAction: SectionButtonFields['action'];
  primaryButtonUrl: SectionButtonFields['url'];
  secondaryButtonLabel: SectionButtonFields['label'];
  secondaryButtonAction: SectionButtonFields['action'];
  secondaryButtonUrl: SectionButtonFields['url'];
  trustLine: string | null;
  badgeValue: string | null;
  badgeText: string | null;
  items: unknown;
  smallPrint: string | null;
  inviteMessage: string | null;
};

export type LandingPageSectionCreateInput = {
  landingPageId: string;
  sectionType: SectionType;
  position: number;
  isVisible?: boolean;
  eyebrow?: string;
  heading?: string;
  text?: string;
  primaryButtonLabel?: string;
  primaryButtonAction?: ButtonAction;
  primaryButtonUrl?: { primaryLinkUrl: string };
  secondaryButtonLabel?: string;
  secondaryButtonAction?: ButtonAction;
  secondaryButtonUrl?: { primaryLinkUrl: string };
  trustLine?: string;
  badgeValue?: string;
  badgeText?: string;
  items?: StatItem[] | CardItem[] | TierItem[] | AmountItem[];
  smallPrint?: string;
  inviteMessage?: string;
};

export const SECTION_TYPES: SectionType[] = [
  'HERO',
  'STATS',
  'STORY',
  'GIVE',
  'QUOTE',
  'JOIN',
  'VOLUNTEER',
  'THANKS',
  'INVITE',
];

const BUTTON_ACTIONS: ButtonAction[] = ['GIVE', 'JOIN', 'VOLUNTEER', 'LINK'];

const SINGLE_USE_TYPES: SectionType[] = [
  'JOIN',
  'VOLUNTEER',
  'THANKS',
  'INVITE',
];

export const MAX_ITEMS_BY_TYPE: Record<SectionType, number> = {
  HERO: 0,
  STATS: 4,
  STORY: 3,
  GIVE: 6,
  QUOTE: 0,
  JOIN: 0,
  VOLUNTEER: 0,
  THANKS: 3,
  INVITE: 0,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const SHORT_TEXT_LIMIT = 200;
const HEADING_LIMIT = 300;
const TEXT_LIMIT = 4000;
const URL_LIMIT = 2048;
const ID_LIMIT = 64;
export const MAX_SECTIONS = 40;
export const INVITE_MESSAGE_LIMIT = 300;
export const DEFAULT_INVITE_MESSAGE = '{friend}, I want you to see this.';

const WHOLE_DOLLAR_PATTERN = /^\d{1,6}$/;

export const DEFAULT_GIVE_AMOUNTS = [25, 50, 100];
const GIVE_AMOUNT_COUNT = 3;
const MIN_GIVE_AMOUNT = 5;

export const parseGiveAmounts = (raw: string | null): number[] => {
  const parts = (raw ?? '').split(',').map((part) => part.trim());

  if (
    parts.length !== GIVE_AMOUNT_COUNT ||
    !parts.every((part) => WHOLE_DOLLAR_PATTERN.test(part))
  ) {
    return DEFAULT_GIVE_AMOUNTS;
  }

  const amounts = parts.map(Number);

  return amounts.every((amount) => amount >= MIN_GIVE_AMOUNT)
    ? amounts
    : DEFAULT_GIVE_AMOUNTS;
};

const PHOTO_TYPES: SectionType[] = ['HERO', 'STORY', 'QUOTE'];

// Over-long values are cut, never rejected.
const readText = (value: unknown, limit = SHORT_TEXT_LIMIT): string =>
  typeof value === 'string' ? value.trim().slice(0, limit) : '';

const isSectionType = (value: unknown): value is SectionType =>
  SECTION_TYPES.some((sectionType) => sectionType === value);

const isButtonAction = (value: unknown): value is ButtonAction =>
  BUTTON_ACTIONS.some((action) => action === value);

const readItem = (
  sectionType: SectionType,
  raw: unknown,
): StatItem | CardItem | TierItem | AmountItem | null => {
  if (!isRecord(raw)) {
    return null;
  }

  if (sectionType === 'THANKS') {
    const amount = readText(raw.amount);

    return WHOLE_DOLLAR_PATTERN.test(amount) ? { amount } : null;
  }

  if (sectionType === 'STATS') {
    const value = readText(raw.value);

    return value === '' ? null : { value, label: readText(raw.label) };
  }

  const title = readText(raw.title);

  if (title === '') {
    return null;
  }

  if (sectionType === 'STORY') {
    return { title, text: readText(raw.text) };
  }

  if (sectionType === 'GIVE') {
    return {
      amount: readText(raw.amount),
      title,
      text: readText(raw.text),
      featured: raw.featured === true,
    };
  }

  return null;
};

export const parseItems = (
  sectionType: SectionType,
  raw: unknown,
): StatItem[] | CardItem[] | TierItem[] | AmountItem[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  const items: (StatItem | CardItem | TierItem | AmountItem)[] = [];

  for (const entry of raw) {
    const item = readItem(sectionType, entry);

    if (item !== null) {
      items.push(item);
    }
  }

  return items.slice(0, MAX_ITEMS_BY_TYPE[sectionType]) as
    | StatItem[]
    | CardItem[]
    | TierItem[]
    | AmountItem[];
};

export const isHttpsUrl = (value: string): boolean => {
  if (value === '' || /\s/.test(value)) {
    return false;
  }

  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

const toButton = (fields: SectionButtonFields): SectionButton | null => {
  const label = readText(fields.label);

  if (label === '' || !isButtonAction(fields.action)) {
    return null;
  }

  if (fields.action !== 'LINK') {
    return { label, action: fields.action, url: null };
  }

  // A cut-off URL would point somewhere else, so an over-long one drops the button.
  const url = readText(fields.url?.primaryLinkUrl, URL_LIMIT + 1);

  return url.length <= URL_LIMIT && isHttpsUrl(url)
    ? { label, action: 'LINK', url }
    : null;
};

// Fields a section type does not show are cleared, so a stray draft value never publishes.
const applyTypeRules = (content: SectionContent): SectionContent => {
  const isHero = content.sectionType === 'HERO';
  const isInvite = content.sectionType === 'INVITE';
  const keepsButton =
    content.sectionType === 'THANKS'
      ? content.primaryButton?.action === 'GIVE'
      : !isInvite;

  return {
    ...content,
    primaryButton: keepsButton ? content.primaryButton : null,
    inviteMessage: isInvite
      ? content.inviteMessage.slice(0, INVITE_MESSAGE_LIMIT) ||
        DEFAULT_INVITE_MESSAGE
      : '',
    inviteButtonLabel: isInvite ? content.inviteButtonLabel : '',
    photo: PHOTO_TYPES.includes(content.sectionType) ? content.photo : null,
    secondaryButton: isHero ? content.secondaryButton : null,
    trustLine: isHero ? content.trustLine : '',
    badgeValue: isHero ? content.badgeValue : '',
    badgeText: isHero ? content.badgeText : '',
  };
};

export const toSectionContent = (
  record: LandingPageSectionRecord,
  photo: PublishedPhoto | null,
): SectionContent =>
  applyTypeRules({
    id: record.id.slice(0, ID_LIMIT),
    sectionType: record.sectionType,
    eyebrow: readText(record.eyebrow),
    heading: readText(record.heading, HEADING_LIMIT),
    text: readText(record.text, TEXT_LIMIT),
    photo,
    primaryButton: toButton({
      label: record.primaryButtonLabel,
      action: record.primaryButtonAction,
      url: record.primaryButtonUrl,
    }),
    secondaryButton: toButton({
      label: record.secondaryButtonLabel,
      action: record.secondaryButtonAction,
      url: record.secondaryButtonUrl,
    }),
    trustLine: readText(record.trustLine),
    badgeValue: readText(record.badgeValue),
    badgeText: readText(record.badgeText),
    items: parseItems(record.sectionType, record.items),
    smallPrint: readText(record.smallPrint),
    inviteMessage: readText(record.inviteMessage, INVITE_MESSAGE_LIMIT),
    inviteButtonLabel: readText(record.primaryButtonLabel),
  });

export const buildPublishedContent = (
  records: LandingPageSectionRecord[],
  photos: Map<string, PublishedPhoto | null>,
  page: PublishedPage = EMPTY_PUBLISHED_PAGE,
): PublishedContent => {
  const seenSingleUseTypes = new Set<SectionType>();
  const sections: SectionContent[] = [];

  const visibleRecords = records
    .filter((record) => record.isVisible !== false)
    .sort(
      (first, second) =>
        (first.position ?? Number.MAX_SAFE_INTEGER) -
          (second.position ?? Number.MAX_SAFE_INTEGER) ||
        first.id.localeCompare(second.id),
    );

  for (const record of visibleRecords) {
    if (SINGLE_USE_TYPES.includes(record.sectionType)) {
      if (seenSingleUseTypes.has(record.sectionType)) {
        continue;
      }
      seenSingleUseTypes.add(record.sectionType);
    }

    sections.push(toSectionContent(record, photos.get(record.id) ?? null));
  }

  return {
    version: 1,
    page: {
      title: readText(page.title, HEADING_LIMIT),
      shareDescription: readText(page.shareDescription, TEXT_LIMIT),
      shareImage: page.shareImage,
    },
    sections: sections.slice(0, MAX_SECTIONS),
  };
};

const parsePhoto = (raw: unknown): PublishedPhoto | null => {
  if (!isRecord(raw) || typeof raw.fileId !== 'string' || raw.fileId === '') {
    return null;
  }

  return {
    fileId: raw.fileId.slice(0, ID_LIMIT),
    sourceFileId: readText(raw.sourceFileId, ID_LIMIT),
    altText: readText(raw.altText),
  };
};

const parseButton = (raw: unknown): SectionButton | null => {
  if (!isRecord(raw)) {
    return null;
  }

  return toButton({
    label: typeof raw.label === 'string' ? raw.label : null,
    action: isButtonAction(raw.action) ? raw.action : null,
    url: typeof raw.url === 'string' ? { primaryLinkUrl: raw.url } : null,
  });
};

const parseSection = (raw: unknown): SectionContent | null => {
  if (
    !isRecord(raw) ||
    typeof raw.id !== 'string' ||
    !isSectionType(raw.sectionType)
  ) {
    return null;
  }

  return applyTypeRules({
    id: raw.id.slice(0, ID_LIMIT),
    sectionType: raw.sectionType,
    eyebrow: readText(raw.eyebrow),
    heading: readText(raw.heading, HEADING_LIMIT),
    text: readText(raw.text, TEXT_LIMIT),
    photo: parsePhoto(raw.photo),
    primaryButton: parseButton(raw.primaryButton),
    secondaryButton: parseButton(raw.secondaryButton),
    trustLine: readText(raw.trustLine),
    badgeValue: readText(raw.badgeValue),
    badgeText: readText(raw.badgeText),
    items: parseItems(raw.sectionType, raw.items),
    smallPrint: readText(raw.smallPrint),
    inviteMessage: readText(raw.inviteMessage, INVITE_MESSAGE_LIMIT),
    inviteButtonLabel: readText(raw.inviteButtonLabel),
  });
};

// Content published before page fields existed has no page; it reads as empty fields.
const parsePage = (raw: unknown): PublishedPage =>
  isRecord(raw)
    ? {
        title: readText(raw.title, HEADING_LIMIT),
        shareDescription: readText(raw.shareDescription, TEXT_LIMIT),
        shareImage: parsePhoto(raw.shareImage),
      }
    : EMPTY_PUBLISHED_PAGE;

export const parsePublishedContent = (
  raw: unknown,
): PublishedContent | null => {
  if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.sections)) {
    return null;
  }

  const sections: SectionContent[] = [];

  for (const rawSection of raw.sections.slice(0, MAX_SECTIONS)) {
    const section = parseSection(rawSection);

    if (section === null) {
      return null;
    }
    sections.push(section);
  }

  return { version: 1, page: parsePage(raw.page), sections };
};

// The published copy has its own file id, so photos compare by draft file id and alt text.
const toComparableSections = (sections: SectionContent[]) =>
  sections.map((section) => ({
    ...section,
    photo: section.photo && {
      sourceFileId: section.photo.sourceFileId,
      altText: section.photo.altText,
    },
  }));

export const draftDiffersFromPublished = (
  records: LandingPageSectionRecord[],
  published: PublishedContent | null,
  draftPage: DraftPageFields,
): boolean => {
  const normalizedPublished = parsePublishedContent(published);
  const photos = new Map<string, PublishedPhoto | null>();

  for (const record of records) {
    const draftPhoto = record.photo?.[0];

    photos.set(
      record.id,
      draftPhoto
        ? {
            fileId: draftPhoto.fileId,
            sourceFileId: draftPhoto.fileId,
            altText: draftPhoto.label,
          }
        : null,
    );
  }

  const draft = buildPublishedContent(records, photos);

  if (normalizedPublished === null) {
    return draft.sections.length > 0;
  }

  const publishedPage = normalizedPublished.page;

  return (
    readText(draftPage.title, HEADING_LIMIT) !== publishedPage.title ||
    readText(draftPage.shareDescription, TEXT_LIMIT) !==
      publishedPage.shareDescription ||
    (draftPage.shareImageFileId ?? null) !==
      (publishedPage.shareImage?.sourceFileId ?? null) ||
    JSON.stringify(toComparableSections(draft.sections)) !==
      JSON.stringify(toComparableSections(normalizedPublished.sections))
  );
};
