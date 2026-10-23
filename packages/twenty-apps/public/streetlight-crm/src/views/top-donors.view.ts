import { defineView, STANDARD_OBJECT, ViewType, ViewVisibility } from 'twenty-sdk/define';

import {
  PERSON_LAST_GIFT_DATE_FIELD_UID,
  PERSON_LIFETIME_HARD_GIVING_FIELD_UID,
  PERSON_OBJECT_UID,
} from 'src/constants/dashboard-identifiers';

export default defineView({
  universalIdentifier: 'a5e26469-f30e-449b-9768-266b8d7eeac8',
  name: 'Top Donors',
  objectUniversalIdentifier: PERSON_OBJECT_UID || STANDARD_OBJECT.person.universalIdentifier,
  type: ViewType.TABLE,
  visibility: ViewVisibility.WORKSPACE,
  position: 3,
  fields: [
    { universalIdentifier: 'a4444444-0000-4000-8000-000000000001', fieldMetadataUniversalIdentifier: STANDARD_OBJECT.person.fields.name.universalIdentifier, position: 0, isVisible: true, size: 200 },
    { universalIdentifier: 'a4444444-0000-4000-8000-000000000002', fieldMetadataUniversalIdentifier: PERSON_LIFETIME_HARD_GIVING_FIELD_UID, position: 1, isVisible: true, size: 180, aggregateOperation: 'SUM' as never },
    { universalIdentifier: 'a4444444-0000-4000-8000-000000000003', fieldMetadataUniversalIdentifier: PERSON_LAST_GIFT_DATE_FIELD_UID, position: 2, isVisible: true, size: 130 },
  ],
  sorts: [
    {
      universalIdentifier: 'c4444444-0000-4000-8000-000000000001',
      fieldMetadataUniversalIdentifier: PERSON_LIFETIME_HARD_GIVING_FIELD_UID,
      direction: 'DESC' as never,
    },
  ],
});