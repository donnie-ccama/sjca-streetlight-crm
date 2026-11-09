export type ResponseType =
  | 'VISIT'
  | 'GIVE_CLICK'
  | 'PRAY'
  | 'VOLUNTEER'
  | 'GIFT'
  | 'GIVING_QUESTION';

export type Network =
  | 'FACEBOOK'
  | 'INSTAGRAM'
  | 'TIKTOK'
  | 'YOUTUBE'
  | 'OTHER'
  | 'NONE';

export type SocialPostStatus =
  | 'DRAFT'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'FAILED';

export type LandingPageStatus = 'DRAFT' | 'LIVE' | 'ARCHIVED';

export type SectionType =
  | 'HERO'
  | 'STATS'
  | 'STORY'
  | 'GIVE'
  | 'QUOTE'
  | 'JOIN'
  | 'VOLUNTEER'
  | 'THANKS'
  | 'INVITE';

export type PageType = 'ONE_STEP' | 'TWO_STEP';

export type ButtonAction = 'GIVE' | 'JOIN' | 'VOLUNTEER' | 'LINK';
