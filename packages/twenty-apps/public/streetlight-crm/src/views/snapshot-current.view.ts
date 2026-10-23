import { defineView, ViewType, ViewVisibility } from 'twenty-sdk/define';

import {
  ACTIVE_DONORS_90D_FIELD_UID,
  AVG_GIFT_FIELD_UID,
  COMPANY_DONORS_YTD_FIELD_UID,
  COMPUTED_AT_FIELD_UID,
  DASHBOARD_SNAPSHOT_OBJECT_UID,
  INDIVIDUAL_DONORS_YTD_FIELD_UID,
  SNAPSHOT_KEY_FIELD_UID,
  VIEW_SNAPSHOT_CURRENT_ID,
  YTD_DONORS_FIELD_UID,
  YTD_GIVING_FIELD_UID,
} from 'src/constants/dashboard-identifiers';

export default defineView({
  universalIdentifier: VIEW_SNAPSHOT_CURRENT_ID,
  name: 'KPI Snapshot',
  objectUniversalIdentifier: DASHBOARD_SNAPSHOT_OBJECT_UID,
  type: ViewType.TABLE,
  visibility: ViewVisibility.WORKSPACE,
  position: 0,
  fields: [
    { universalIdentifier: 'a1111111-0000-4000-8000-000000000008', fieldMetadataUniversalIdentifier: SNAPSHOT_KEY_FIELD_UID, position: 0, isVisible: true, size: 100 },
    { universalIdentifier: 'a1111111-0000-4000-8000-000000000001', fieldMetadataUniversalIdentifier: YTD_DONORS_FIELD_UID, position: 1, isVisible: true, size: 120 },
    { universalIdentifier: 'a1111111-0000-4000-8000-000000000002', fieldMetadataUniversalIdentifier: YTD_GIVING_FIELD_UID, position: 2, isVisible: true, size: 140 },
    { universalIdentifier: 'a1111111-0000-4000-8000-000000000003', fieldMetadataUniversalIdentifier: INDIVIDUAL_DONORS_YTD_FIELD_UID, position: 3, isVisible: true, size: 140 },
    { universalIdentifier: 'a1111111-0000-4000-8000-000000000004', fieldMetadataUniversalIdentifier: COMPANY_DONORS_YTD_FIELD_UID, position: 4, isVisible: true, size: 140 },
    { universalIdentifier: 'a1111111-0000-4000-8000-000000000005', fieldMetadataUniversalIdentifier: ACTIVE_DONORS_90D_FIELD_UID, position: 5, isVisible: true, size: 140 },
    { universalIdentifier: 'a1111111-0000-4000-8000-000000000006', fieldMetadataUniversalIdentifier: AVG_GIFT_FIELD_UID, position: 6, isVisible: true, size: 120 },
    { universalIdentifier: 'a1111111-0000-4000-8000-000000000007', fieldMetadataUniversalIdentifier: COMPUTED_AT_FIELD_UID, position: 7, isVisible: true, size: 160 },
  ],
  filters: [
    {
      universalIdentifier: 'b1111111-0000-4000-8000-000000000001',
      fieldMetadataUniversalIdentifier: SNAPSHOT_KEY_FIELD_UID,
      operand: 'CONTAINS' as never,
      value: 'CURRENT',
      positionInViewFilterGroup: 0,
    },
  ],
});
