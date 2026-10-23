import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { PERSON_LAST_GIFT_DATE_FIELD_UID } from 'src/constants/dashboard-identifiers';

export default defineField({
  universalIdentifier: PERSON_LAST_GIFT_DATE_FIELD_UID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.DATE,
  name: 'lastGiftDate',
  label: 'Last Gift Date',
  icon: 'IconCalendarEvent',
  isNullable: true,
});
