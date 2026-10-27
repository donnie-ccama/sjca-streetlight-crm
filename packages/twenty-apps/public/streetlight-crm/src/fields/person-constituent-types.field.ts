import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { PERSON_CONSTITUENT_TYPES_FIELD_ID } from 'src/constants/donor-identifiers';

export default defineField({
  universalIdentifier: PERSON_CONSTITUENT_TYPES_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.MULTI_SELECT,
  name: 'constituentTypes',
  label: 'Constituent Types',
  icon: 'IconUsersGroup',
  isNullable: true,
  options: [
    { value: 'DONOR', label: 'Donor', position: 0, color: 'blue' },
    { value: 'VOLUNTEER', label: 'Volunteer', position: 1, color: 'green' },
    { value: 'BOARD_MEMBER', label: 'Board Member', position: 2, color: 'purple' },
    { value: 'STAFF', label: 'Staff', position: 3, color: 'gray' },
    { value: 'PARTNER', label: 'Partner', position: 4, color: 'turquoise' },
    { value: 'BENEFICIARY', label: 'Beneficiary', position: 5, color: 'orange' },
  ],
});
