import { defineView, ViewType, ViewVisibility } from 'twenty-sdk/define';

import {
  DONATION_ACK_STATUS_FIELD_UID,
  DONATION_AMOUNT_FIELD_UID,
  DONATION_GIFT_DATE_FIELD_UID,
  DONATION_NAME_FIELD_UID,
  DONATION_OBJECT_UID,
} from 'src/constants/dashboard-identifiers';
import {
  DONATION_FUND_FIELD_UID,
  DONATION_PAYMENT_METHOD_FIELD_UID,
  VIEW_DONATIONS_TODAY_ID,
} from 'src/constants/daily-giving-identifiers';

// Donations whose gift date IS today — the native companion table on the
// Daily Giving page. IS_TODAY is evaluated live, so this view never goes
// stale (unlike literal-date filters).
export default defineView({
  universalIdentifier: VIEW_DONATIONS_TODAY_ID,
  name: "Today's Gifts",
  objectUniversalIdentifier: DONATION_OBJECT_UID,
  type: ViewType.TABLE,
  visibility: ViewVisibility.WORKSPACE,
  position: 5,
  fields: [
    { universalIdentifier: 'a6666666-0000-4000-8000-000000000001', fieldMetadataUniversalIdentifier: DONATION_NAME_FIELD_UID, position: 0, isVisible: true, size: 240 },
    { universalIdentifier: 'a6666666-0000-4000-8000-000000000002', fieldMetadataUniversalIdentifier: DONATION_AMOUNT_FIELD_UID, position: 1, isVisible: true, size: 130 },
    { universalIdentifier: 'a6666666-0000-4000-8000-000000000003', fieldMetadataUniversalIdentifier: DONATION_PAYMENT_METHOD_FIELD_UID, position: 2, isVisible: true, size: 140 },
    { universalIdentifier: 'a6666666-0000-4000-8000-000000000004', fieldMetadataUniversalIdentifier: DONATION_FUND_FIELD_UID, position: 3, isVisible: true, size: 170 },
    { universalIdentifier: 'a6666666-0000-4000-8000-000000000005', fieldMetadataUniversalIdentifier: DONATION_GIFT_DATE_FIELD_UID, position: 4, isVisible: false, size: 120 },
    { universalIdentifier: 'a6666666-0000-4000-8000-000000000006', fieldMetadataUniversalIdentifier: DONATION_ACK_STATUS_FIELD_UID, position: 5, isVisible: true, size: 150 },
  ],
  filters: [
    {
      universalIdentifier: 'b6666666-0000-4000-8000-000000000001',
      fieldMetadataUniversalIdentifier: DONATION_GIFT_DATE_FIELD_UID,
      operand: 'IS_TODAY' as never,
      value: [],
      positionInViewFilterGroup: 0,
    },
  ],
  sorts: [
    {
      universalIdentifier: 'c6666666-0000-4000-8000-000000000001',
      fieldMetadataUniversalIdentifier: DONATION_GIFT_DATE_FIELD_UID,
      direction: 'DESC' as never,
    },
  ],
});
