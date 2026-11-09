import {
  DEFAULT_INVITE_MESSAGE,
  type LandingPageSectionCreateInput,
} from 'src/shared/marketing/sections';
import type { PageType } from 'src/shared/marketing/types';

type StarterSection = Omit<
  LandingPageSectionCreateInput,
  'landingPageId' | 'position'
>;

const STATS_SECTION: StarterSection = {
  sectionType: 'STATS',
  heading: 'Our impact',
  items: [
    { value: '100', label: 'people helped' },
    { value: '12', label: 'volunteers' },
    { value: '5', label: 'years serving' },
  ],
};

const QUOTE_SECTION: StarterSection = {
  sectionType: 'QUOTE',
  heading: 'Add a short quote from someone you have helped.',
  text: 'Name, role',
};

const INVITE_SECTION: StarterSection = {
  sectionType: 'INVITE',
  heading: 'Invite a friend',
  primaryButtonLabel: 'Invite {friend}',
  inviteMessage: DEFAULT_INVITE_MESSAGE,
};

const ONE_STEP_SECTIONS: StarterSection[] = [
  {
    sectionType: 'HERO',
    eyebrow: 'Your city',
    heading: 'Your headline goes here',
    text: 'Say in one or two sentences why this page matters.',
    primaryButtonLabel: 'Give today',
    primaryButtonAction: 'GIVE',
  },
  STATS_SECTION,
  {
    sectionType: 'GIVE',
    heading: 'Make a gift',
    text: 'Every gift helps. Choose an amount that works for you.',
    primaryButtonLabel: 'Give now',
    primaryButtonAction: 'GIVE',
    items: [
      {
        amount: '25',
        title: 'Supporter',
        text: 'Describe what this gift does.',
        featured: false,
      },
      {
        amount: '50',
        title: 'Champion',
        text: 'Describe what this gift does.',
        featured: true,
      },
      {
        amount: '100',
        title: 'Partner',
        text: 'Describe what this gift does.',
        featured: false,
      },
    ],
  },
  QUOTE_SECTION,
  INVITE_SECTION,
  {
    sectionType: 'JOIN',
    heading: 'Not ready to give? Pray with us.',
    text: 'Join the list for updates.',
    primaryButtonLabel: 'Join',
    primaryButtonAction: 'JOIN',
  },
];

const TWO_STEP_SECTIONS: StarterSection[] = [
  {
    sectionType: 'HERO',
    eyebrow: 'Your city',
    heading: 'Your headline goes here',
    text: 'Say in one or two sentences why this page matters.',
    primaryButtonLabel: 'Join',
    primaryButtonAction: 'JOIN',
  },
  {
    sectionType: 'JOIN',
    heading: 'Stay in touch',
    text: 'Join the list for updates.',
    primaryButtonLabel: 'Join',
    primaryButtonAction: 'JOIN',
  },
  {
    sectionType: 'STORY',
    eyebrow: 'What you get',
    heading: 'What you get',
    text: 'Say what people receive when they join.',
    items: [
      { title: 'First benefit', text: 'Describe it in one sentence.' },
      { title: 'Second benefit', text: 'Describe it in one sentence.' },
      { title: 'Third benefit', text: 'Describe it in one sentence.' },
    ],
  },
  STATS_SECTION,
  QUOTE_SECTION,
  {
    sectionType: 'THANKS',
    heading: 'Thank you for joining',
    text: 'One more way to help. Give a gift today.',
    primaryButtonLabel: 'Give',
    primaryButtonAction: 'GIVE',
    smallPrint: 'No thanks, maybe later',
    items: [{ amount: '15' }, { amount: '25' }, { amount: '50' }],
  },
  INVITE_SECTION,
];

const STARTER_SECTIONS_BY_PAGE_TYPE: Record<PageType, StarterSection[]> = {
  ONE_STEP: ONE_STEP_SECTIONS,
  TWO_STEP: TWO_STEP_SECTIONS,
};

export const buildStarterSections = (
  landingPageId: string,
  pageType: PageType,
): LandingPageSectionCreateInput[] =>
  STARTER_SECTIONS_BY_PAGE_TYPE[pageType].map((section, position) => ({
    ...section,
    landingPageId,
    position,
  }));
