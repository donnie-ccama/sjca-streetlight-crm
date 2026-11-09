import type { ButtonAction, SectionType } from 'src/shared/marketing/types';

export type EditorField =
  | 'eyebrow'
  | 'heading'
  | 'text'
  | 'photo'
  | 'primaryButton'
  | 'secondaryButton'
  | 'formButtonLabel'
  | 'trustLine'
  | 'badge'
  | 'items'
  | 'smallPrint'
  | 'inviteButtonLabel'
  | 'inviteMessage';

export type ItemField = 'value' | 'label' | 'title' | 'text' | 'amount' | 'featured';

export const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  HERO: 'Top banner (Hero)',
  STATS: 'Numbers',
  STORY: 'Story',
  GIVE: 'Give',
  QUOTE: 'Quote',
  JOIN: 'Join the list',
  VOLUNTEER: 'Volunteer',
  THANKS: 'Thank-you screen',
  INVITE: 'Invite a friend',
};

export const SECTION_TYPE_DESCRIPTIONS: Record<SectionType, string> = {
  HERO: 'The first thing people see: a big heading, a photo, and buttons.',
  STATS: 'A band of up to 4 big numbers, like "1,200 meals".',
  STORY: 'A photo with a short story and up to 3 points.',
  GIVE: 'Gift amounts and what each one does, with a Give button.',
  QUOTE: 'A wide photo with a quote over it.',
  JOIN: 'A form that adds people to the prayer list.',
  VOLUNTEER: 'A form for people who want to volunteer.',
  THANKS: 'Shows after someone signs up. Asks for a gift.',
  INVITE: 'Lets visitors send this page to a friend.',
};

// Spec section 5: the fields each section type shows.
export const FIELDS_BY_TYPE: Record<SectionType, EditorField[]> = {
  HERO: [
    'eyebrow',
    'heading',
    'text',
    'photo',
    'primaryButton',
    'secondaryButton',
    'trustLine',
    'badge',
  ],
  STATS: ['items'],
  STORY: ['photo', 'eyebrow', 'heading', 'text', 'items'],
  GIVE: ['eyebrow', 'heading', 'text', 'items', 'primaryButton', 'smallPrint'],
  QUOTE: ['photo', 'heading', 'text'],
  JOIN: ['eyebrow', 'heading', 'text', 'formButtonLabel'],
  VOLUNTEER: ['eyebrow', 'heading', 'text', 'formButtonLabel'],
  THANKS: ['eyebrow', 'heading', 'text', 'items', 'primaryButton', 'smallPrint'],
  INVITE: ['eyebrow', 'heading', 'text', 'inviteButtonLabel', 'inviteMessage'],
};

export const ITEM_FIELDS_BY_TYPE: Record<SectionType, ItemField[]> = {
  HERO: [],
  STATS: ['value', 'label'],
  STORY: ['title', 'text'],
  GIVE: ['amount', 'title', 'text', 'featured'],
  QUOTE: [],
  JOIN: [],
  VOLUNTEER: [],
  THANKS: ['amount'],
  INVITE: [],
};

export const ITEM_LABELS: Record<SectionType, { singular: string; plural: string }> = {
  HERO: { singular: 'Item', plural: 'Items' },
  STATS: { singular: 'Number', plural: 'Numbers' },
  STORY: { singular: 'Point', plural: 'Points' },
  GIVE: { singular: 'Gift amount', plural: 'Gift amounts' },
  QUOTE: { singular: 'Item', plural: 'Items' },
  JOIN: { singular: 'Item', plural: 'Items' },
  VOLUNTEER: { singular: 'Item', plural: 'Items' },
  THANKS: { singular: 'Amount', plural: 'Amounts' },
  INVITE: { singular: 'Item', plural: 'Items' },
};

export const ITEM_FIELD_LABELS: Record<ItemField, string> = {
  value: 'Number',
  label: 'What it counts',
  title: 'Title',
  text: 'Text',
  amount: 'Amount',
  featured: 'Most chosen',
};

export const BUTTON_ACTION_LABELS: Record<ButtonAction, string> = {
  GIVE: 'Give',
  JOIN: 'Join form',
  VOLUNTEER: 'Volunteer form',
  LINK: 'Link',
};

export const BUTTON_ACTIONS: ButtonAction[] = ['GIVE', 'JOIN', 'VOLUNTEER', 'LINK'];

// The public page accepts only a Give button on the thank-you screen.
export const BUTTON_ACTIONS_BY_TYPE: Partial<Record<SectionType, ButtonAction[]>> = {
  THANKS: ['GIVE'],
};

export const SINGLE_USE_TYPES: SectionType[] = ['JOIN', 'VOLUNTEER', 'THANKS', 'INVITE'];
