import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { PERSON_IS_LAPSED_FIELD_UID } from 'src/constants/dashboard-identifiers';

export default defineField({
  universalIdentifier: PERSON_IS_LAPSED_FIELD_UID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.SELECT,
  name: 'isLapsed90d',
  label: 'Lapsed (90d)',
  description: 'Maintained hourly from hard-credit gift history',
  icon: 'IconUserPause',
  defaultValue: "'FALSE'",
  options: [
    { value: 'FALSE', label: 'No', position: 0, color: 'green' },
    { value: 'TRUE', label: 'Yes', position: 1, color: 'orange' },
  ],
});
