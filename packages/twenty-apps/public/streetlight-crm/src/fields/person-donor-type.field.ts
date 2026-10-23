import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { PERSON_DONOR_TYPE_FIELD_ID } from 'src/constants/donor-identifiers';

export default defineField({
  universalIdentifier: PERSON_DONOR_TYPE_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.SELECT,
  name: 'donorType',
  label: 'Donor Type',
  icon: 'IconUserHeart',
  isNullable: true,
  options: [
    { value: 'MAJOR', label: 'Major', position: 0, color: 'purple' },
    { value: 'ANNUAL', label: 'Annual', position: 1, color: 'blue' },
    { value: 'MONTHLY', label: 'Monthly', position: 2, color: 'turquoise' },
    { value: 'LAPSED', label: 'Lapsed', position: 3, color: 'orange' },
    { value: 'PROSPECT', label: 'Prospect', position: 4, color: 'gray' },
    { value: 'BOARD', label: 'Board', position: 5, color: 'green' },
  ],
});
