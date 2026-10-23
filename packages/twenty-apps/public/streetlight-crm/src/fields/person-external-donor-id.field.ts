import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { PERSON_EXTERNAL_DONOR_ID_FIELD_ID } from 'src/constants/donor-identifiers';

export default defineField({
  universalIdentifier: PERSON_EXTERNAL_DONOR_ID_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.TEXT,
  name: 'externalDonorId',
  label: 'External Donor ID',
  icon: 'IconFingerprint',
  isNullable: true,
  isUnique: true,
});
