import { defineView, ViewType, ViewVisibility } from 'twenty-sdk/define';

import {
  DONOR_COUNT_FIELD_UID,
  GIFT_COUNT_FIELD_UID,
  MONTHLY_GIVING_POINT_OBJECT_UID,
  PERIOD_LABEL_FIELD_UID,
  SORT_KEY_FIELD_UID,
  TOTAL_AMOUNT_FIELD_UID,
  VIEW_MONTHLY_GIVING_ID,
} from 'src/constants/dashboard-identifiers';

export default defineView({
  universalIdentifier: VIEW_MONTHLY_GIVING_ID,
  name: 'Monthly Giving',
  objectUniversalIdentifier: MONTHLY_GIVING_POINT_OBJECT_UID,
  type: ViewType.TABLE,
  visibility: ViewVisibility.WORKSPACE,
  position: 1,
  fields: [
    { universalIdentifier: 'a2222222-0000-4000-8000-000000000001', fieldMetadataUniversalIdentifier: PERIOD_LABEL_FIELD_UID, position: 0, isVisible: true, size: 110 },
    { universalIdentifier: 'a2222222-0000-4000-8000-000000000002', fieldMetadataUniversalIdentifier: TOTAL_AMOUNT_FIELD_UID, position: 1, isVisible: true, size: 150, aggregateOperation: 'SUM' as never },
    { universalIdentifier: 'a2222222-0000-4000-8000-000000000003', fieldMetadataUniversalIdentifier: GIFT_COUNT_FIELD_UID, position: 2, isVisible: true, size: 90, aggregateOperation: 'SUM' as never },
    { universalIdentifier: 'a2222222-0000-4000-8000-000000000004', fieldMetadataUniversalIdentifier: DONOR_COUNT_FIELD_UID, position: 3, isVisible: true, size: 90 },
    { universalIdentifier: 'a2222222-0000-4000-8000-000000000005', fieldMetadataUniversalIdentifier: SORT_KEY_FIELD_UID, position: 4, isVisible: false, size: 100 },
  ],
  sorts: [
    {
      universalIdentifier: 'c2222222-0000-4000-8000-000000000001',
      fieldMetadataUniversalIdentifier: SORT_KEY_FIELD_UID,
      direction: 'DESC' as never,
    },
  ],
});