import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { PERSON_PREFERRED_ACKNOWLEDGMENT_FIELD_ID } from 'src/constants/donor-identifiers';

export default defineField({
  universalIdentifier: PERSON_PREFERRED_ACKNOWLEDGMENT_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.SELECT,
  name: 'preferredAcknowledgment',
  label: 'Preferred Acknowledgment',
  icon: 'IconMail',
  isNullable: true,
  options: [
    { value: 'EMAIL', label: 'Email', position: 0, color: 'blue' },
    { value: 'MAIL', label: 'Mail', position: 1, color: 'purple' },
    { value: 'PHONE', label: 'Phone', position: 2, color: 'green' },
    { value: 'NONE', label: 'None', position: 3, color: 'gray' },
  ],
});
