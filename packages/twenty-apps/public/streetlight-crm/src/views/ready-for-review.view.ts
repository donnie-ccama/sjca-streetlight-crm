import { defineView, ViewType, ViewVisibility } from 'twenty-sdk/define';

import {
  READY_FOR_REVIEW_VIEW_ID,
  SOCIAL_POST_LANDING_PAGE_FIELD_ID,
  SOCIAL_POST_NAME_FIELD_ID,
  SOCIAL_POST_OBJECT_ID,
  SOCIAL_POST_READY_FOR_REVIEW_FIELD_ID,
  SOCIAL_POST_SCHEDULED_AT_FIELD_ID,
  SOCIAL_POST_STATUS_FIELD_ID,
} from 'src/constants/marketing-identifiers';

export default defineView({
  universalIdentifier: READY_FOR_REVIEW_VIEW_ID,
  name: 'Ready for Review',
  objectUniversalIdentifier: SOCIAL_POST_OBJECT_ID,
  type: ViewType.TABLE,
  visibility: ViewVisibility.WORKSPACE,
  position: 1,
  fields: [
    { universalIdentifier: '11fad5f7-e41a-4d26-965d-e9c1b2977384', fieldMetadataUniversalIdentifier: SOCIAL_POST_NAME_FIELD_ID, position: 0, isVisible: true, size: 220 },
    { universalIdentifier: '1f4c0caf-61c1-4032-8096-a53c80c29cc5', fieldMetadataUniversalIdentifier: SOCIAL_POST_STATUS_FIELD_ID, position: 1, isVisible: true, size: 140 },
    { universalIdentifier: 'd2c4c1eb-0307-45b3-ba31-ce09ba6b3d74', fieldMetadataUniversalIdentifier: SOCIAL_POST_LANDING_PAGE_FIELD_ID, position: 2, isVisible: true, size: 180 },
    { universalIdentifier: '8d6316cb-b038-4bd3-9b38-0c622892f229', fieldMetadataUniversalIdentifier: SOCIAL_POST_SCHEDULED_AT_FIELD_ID, position: 3, isVisible: true, size: 160 },
    { universalIdentifier: 'e69e18af-5bf0-4f9d-a430-f057e03fcda4', fieldMetadataUniversalIdentifier: SOCIAL_POST_READY_FOR_REVIEW_FIELD_ID, position: 4, isVisible: true, size: 140 },
  ],
  filterGroups: [
    {
      universalIdentifier: 'ea675e7f-8d24-4136-b3bd-12c7d2c44805',
      logicalOperator: 'AND' as never,
    },
  ],
  filters: [
    {
      universalIdentifier: '2c878a22-26c5-4cd0-abf3-3560f00a572a',
      fieldMetadataUniversalIdentifier: SOCIAL_POST_STATUS_FIELD_ID,
      operand: 'IS' as never,
      value: ['DRAFT'],
      viewFilterGroupUniversalIdentifier: 'ea675e7f-8d24-4136-b3bd-12c7d2c44805',
      positionInViewFilterGroup: 0,
    },
    {
      universalIdentifier: 'cec36b97-b4cb-4a1c-b1c3-ae9330758138',
      fieldMetadataUniversalIdentifier: SOCIAL_POST_READY_FOR_REVIEW_FIELD_ID,
      operand: 'IS' as never,
      value: 'true',
      viewFilterGroupUniversalIdentifier: 'ea675e7f-8d24-4136-b3bd-12c7d2c44805',
      positionInViewFilterGroup: 1,
    },
  ],
});
