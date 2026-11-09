import { defineView, ViewType, ViewVisibility } from 'twenty-sdk/define';

import {
  ALL_SOCIAL_POSTS_VIEW_ID,
  SOCIAL_POST_LANDING_PAGE_FIELD_ID,
  SOCIAL_POST_NAME_FIELD_ID,
  SOCIAL_POST_OBJECT_ID,
  SOCIAL_POST_READY_FOR_REVIEW_FIELD_ID,
  SOCIAL_POST_SCHEDULED_AT_FIELD_ID,
  SOCIAL_POST_STATUS_FIELD_ID,
} from 'src/constants/marketing-identifiers';

export default defineView({
  universalIdentifier: ALL_SOCIAL_POSTS_VIEW_ID,
  name: 'All Social Posts',
  objectUniversalIdentifier: SOCIAL_POST_OBJECT_ID,
  type: ViewType.TABLE,
  visibility: ViewVisibility.WORKSPACE,
  position: 0,
  fields: [
    { universalIdentifier: 'd0981191-7d08-4f9c-a776-69eed5fae596', fieldMetadataUniversalIdentifier: SOCIAL_POST_NAME_FIELD_ID, position: 0, isVisible: true, size: 220 },
    { universalIdentifier: 'd46e08ce-e5ad-453b-8b74-04cb233a147c', fieldMetadataUniversalIdentifier: SOCIAL_POST_STATUS_FIELD_ID, position: 1, isVisible: true, size: 140 },
    { universalIdentifier: '1ca62458-2455-4e27-b6c0-31639ba832b5', fieldMetadataUniversalIdentifier: SOCIAL_POST_LANDING_PAGE_FIELD_ID, position: 2, isVisible: true, size: 180 },
    { universalIdentifier: '08a72c5d-5a5a-43f4-a7b7-917d9033b5ce', fieldMetadataUniversalIdentifier: SOCIAL_POST_SCHEDULED_AT_FIELD_ID, position: 3, isVisible: true, size: 160 },
    { universalIdentifier: '916d3b37-5a92-4541-8796-4d92541eef7e', fieldMetadataUniversalIdentifier: SOCIAL_POST_READY_FOR_REVIEW_FIELD_ID, position: 4, isVisible: true, size: 140 },
  ],
  sorts: [
    {
      universalIdentifier: '6f766ad1-93c4-478b-9ce1-c9dde0ff12f7',
      fieldMetadataUniversalIdentifier: SOCIAL_POST_SCHEDULED_AT_FIELD_ID,
      direction: 'DESC' as never,
    },
  ],
});
