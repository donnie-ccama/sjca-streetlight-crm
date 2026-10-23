import { defineView, ViewType, ViewVisibility } from 'twenty-sdk/define';

import {
  DONATION_ACK_STATUS_FIELD_UID,
  DONATION_AMOUNT_FIELD_UID,
  DONATION_GIFT_DATE_FIELD_UID,
  DONATION_NAME_FIELD_UID,
  DONATION_OBJECT_UID,
  VIEW_ACK_PENDING_ID,
} from 'src/constants/dashboard-identifiers';

// Donations awaiting acknowledgment — oldest gift first (most overdue on top).
export default defineView({
  universalIdentifier: VIEW_ACK_PENDING_ID,
  name: 'Acknowledgments Pending',
  objectUniversalIdentifier: DONATION_OBJECT_UID,
  type: ViewType.TABLE,
  visibility: ViewVisibility.WORKSPACE,
  position: 4,
  fields: [
    { universalIdentifier: 'a5555555-0000-4000-8000-000000000001', fieldMetadataUniversalIdentifier: DONATION_NAME_FIELD_UID, position: 0, isVisible: true, size: 220 },
    { universalIdentifier: 'a5555555-0000-4000-8000-000000000002', fieldMetadataUniversalIdentifier: DONATION_GIFT_DATE_FIELD_UID, position: 1, isVisible: true, size: 130 },
    { universalIdentifier: 'a5555555-0000-4000-8000-000000000003', fieldMetadataUniversalIdentifier: DONATION_AMOUNT_FIELD_UID, position: 2, isVisible: true, size: 140 },
    { universalIdentifier: 'a5555555-0000-4000-8000-000000000004', fieldMetadataUniversalIdentifier: DONATION_ACK_STATUS_FIELD_UID, position: 3, isVisible: true, size: 160 },
  ],
  filters: [
    {
      universalIdentifier: 'b5555555-0000-4000-8000-000000000001',
      fieldMetadataUniversalIdentifier: DONATION_ACK_STATUS_FIELD_UID,
      operand: 'IS' as never,
      value: ['PENDING'],
      positionInViewFilterGroup: 0,
    },
  ],
  sorts: [
    {
      universalIdentifier: 'c5555555-0000-4000-8000-000000000001',
      fieldMetadataUniversalIdentifier: DONATION_GIFT_DATE_FIELD_UID,
      direction: 'ASC' as never,
    },
  ],
});