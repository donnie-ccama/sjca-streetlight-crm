import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { PERSON_FIRST_GIFT_DATE_FIELD_ID } from 'src/constants/donor-identifiers';

export default defineField({
  universalIdentifier: PERSON_FIRST_GIFT_DATE_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.DATE,
  name: 'firstGiftDate',
  label: 'First Gift Date',
  icon: 'IconCalendar',
  isNullable: true,
});
