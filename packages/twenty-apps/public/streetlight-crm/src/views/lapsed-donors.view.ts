import { defineView, STANDARD_OBJECT, ViewType, ViewVisibility } from 'twenty-sdk/define';

import {
  PERSON_DO_NOT_SOLICIT_FIELD_UID,
  PERSON_IS_LAPSED_FIELD_UID,
  PERSON_LAST_GIFT_DATE_FIELD_UID,
  PERSON_LIFETIME_HARD_GIVING_FIELD_UID,
  PERSON_OBJECT_UID,
} from 'src/constants/dashboard-identifiers';

export default defineView({
  universalIdentifier: '1b2f9e08-c906-4b46-8769-171e0b9bcdd7',
  name: 'Lapsed Donors (90+ days)',
  objectUniversalIdentifier: PERSON_OBJECT_UID || STANDARD_OBJECT.person.universalIdentifier,
  type: ViewType.TABLE,
  visibility: ViewVisibility.WORKSPACE,
  position: 2,
  fields: [
    { universalIdentifier: 'a3333333-0000-4000-8000-000000000001', fieldMetadataUniversalIdentifier: STANDARD_OBJECT.person.fields.name.universalIdentifier, position: 0, isVisible: true, size: 200 },
    { universalIdentifier: 'a3333333-0000-4000-8000-000000000002', fieldMetadataUniversalIdentifier: PERSON_LAST_GIFT_DATE_FIELD_UID, position: 1, isVisible: true, size: 130 },
    { universalIdentifier: 'a3333333-0000-4000-8000-000000000003', fieldMetadataUniversalIdentifier: PERSON_LIFETIME_HARD_GIVING_FIELD_UID, position: 2, isVisible: true, size: 170, aggregateOperation: 'SUM' as never },
    { universalIdentifier: 'a3333333-0000-4000-8000-000000000004', fieldMetadataUniversalIdentifier: PERSON_DO_NOT_SOLICIT_FIELD_UID, position: 3, isVisible: true, size: 140 },
    { universalIdentifier: 'a3333333-0000-4000-8000-000000000005', fieldMetadataUniversalIdentifier: PERSON_IS_LAPSED_FIELD_UID, position: 4, isVisible: false, size: 120 },
  ],
  filters: [
    {
      universalIdentifier: 'b3333333-0000-4000-8000-000000000001',
      fieldMetadataUniversalIdentifier: PERSON_IS_LAPSED_FIELD_UID,
      operand: 'IS' as never,
      value: ['TRUE'],
      positionInViewFilterGroup: 0,
    },
  ],
  sorts: [
    {
      universalIdentifier: 'c3333333-0000-4000-8000-000000000001',
      fieldMetadataUniversalIdentifier: PERSON_LAST_GIFT_DATE_FIELD_UID,
      direction: 'ASC' as never,
    },
  ],
});