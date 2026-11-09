import { defineRole } from 'twenty-sdk/define';

import {
  LANDING_PAGE_FUND_FIELD_ID,
  LANDING_PAGE_FUNDRAISING_CAMPAIGN_FIELD_ID,
  LANDING_PAGE_GIVE_AMOUNTS_FIELD_ID,
  LANDING_PAGE_OBJECT_ID,
  LANDING_PAGE_PUBLISHED_AT_FIELD_ID,
  LANDING_PAGE_PUBLISHED_BY_FIELD_ID,
  LANDING_PAGE_PUBLISHED_CONTENT_FIELD_ID,
  LANDING_PAGE_PUBLISHED_PHOTOS_FIELD_ID,
  LANDING_PAGE_SECTION_OBJECT_ID,
  LANDING_PAGE_SECTION_PRIMARY_BUTTON_ACTION_FIELD_ID,
  LANDING_PAGE_SECTION_PRIMARY_BUTTON_URL_FIELD_ID,
  LANDING_PAGE_SECTION_SECONDARY_BUTTON_ACTION_FIELD_ID,
  LANDING_PAGE_SECTION_SECONDARY_BUTTON_URL_FIELD_ID,
  LANDING_PAGE_STATUS_FIELD_ID,
  SOCIAL_AGENT_ROLE_ID,
  SOCIAL_POST_APPROVED_AT_FIELD_ID,
  SOCIAL_POST_APPROVED_BY_FIELD_ID,
  SOCIAL_POST_OBJECT_ID,
  SOCIAL_POST_PUBLISH_RESULT_FIELD_ID,
  SOCIAL_POST_STATUS_FIELD_ID,
} from 'src/constants/marketing-identifiers';

// Approval fields stay human-only (X1): agents create DRAFT posts and set readyForReview.
const APPROVAL_FIELD_IDS = [
  SOCIAL_POST_STATUS_FIELD_ID,
  SOCIAL_POST_APPROVED_BY_FIELD_ID,
  SOCIAL_POST_APPROVED_AT_FIELD_ID,
  SOCIAL_POST_PUBLISH_RESULT_FIELD_ID,
];

// A person makes a page public and picks where gifts go; agents create DRAFT pages.
// Published fields are written only by the publish route.
const LANDING_PAGE_HUMAN_FIELD_IDS = [
  LANDING_PAGE_STATUS_FIELD_ID,
  LANDING_PAGE_GIVE_AMOUNTS_FIELD_ID,
  LANDING_PAGE_FUND_FIELD_ID,
  LANDING_PAGE_FUNDRAISING_CAMPAIGN_FIELD_ID,
  LANDING_PAGE_PUBLISHED_CONTENT_FIELD_ID,
  LANDING_PAGE_PUBLISHED_PHOTOS_FIELD_ID,
  LANDING_PAGE_PUBLISHED_AT_FIELD_ID,
  LANDING_PAGE_PUBLISHED_BY_FIELD_ID,
];

// A LINK button could send a Give click to any address, so agents never set buttons.
const SECTION_BUTTON_FIELD_IDS = [
  LANDING_PAGE_SECTION_PRIMARY_BUTTON_ACTION_FIELD_ID,
  LANDING_PAGE_SECTION_PRIMARY_BUTTON_URL_FIELD_ID,
  LANDING_PAGE_SECTION_SECONDARY_BUTTON_ACTION_FIELD_ID,
  LANDING_PAGE_SECTION_SECONDARY_BUTTON_URL_FIELD_ID,
];

export default defineRole({
  universalIdentifier: SOCIAL_AGENT_ROLE_ID,
  label: 'Social Post Agent',
  description:
    'For AI agent API keys: drafts landing pages and social posts, cannot approve or publish',
  icon: 'IconRobot',
  canReadAllObjectRecords: false,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  canUpdateAllSettings: false,
  canBeAssignedToUsers: false,
  canBeAssignedToAgents: true,
  canBeAssignedToApiKeys: true,
  objectPermissions: [
    LANDING_PAGE_OBJECT_ID,
    LANDING_PAGE_SECTION_OBJECT_ID,
    SOCIAL_POST_OBJECT_ID,
  ].map((objectUniversalIdentifier) => ({
    objectUniversalIdentifier,
    canReadObjectRecords: true,
    canUpdateObjectRecords: true,
    canSoftDeleteObjectRecords: false,
    canDestroyObjectRecords: false,
  })),
  fieldPermissions: [
    ...APPROVAL_FIELD_IDS.map((fieldUniversalIdentifier) => ({
      objectUniversalIdentifier: SOCIAL_POST_OBJECT_ID,
      fieldUniversalIdentifier,
      canUpdateFieldValue: false,
    })),
    ...LANDING_PAGE_HUMAN_FIELD_IDS.map((fieldUniversalIdentifier) => ({
      objectUniversalIdentifier: LANDING_PAGE_OBJECT_ID,
      fieldUniversalIdentifier,
      canUpdateFieldValue: false,
    })),
    ...SECTION_BUTTON_FIELD_IDS.map((fieldUniversalIdentifier) => ({
      objectUniversalIdentifier: LANDING_PAGE_SECTION_OBJECT_ID,
      fieldUniversalIdentifier,
      canUpdateFieldValue: false,
    })),
  ],
});
