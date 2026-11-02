import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { COMPANY_PRIMARY_PHONE_FIELD_ID } from 'src/constants/donor-identifiers';

export default defineField({
  universalIdentifier: COMPANY_PRIMARY_PHONE_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  type: FieldType.TEXT,
  name: 'primaryPhone',
  label: 'Primary Phone',
  icon: 'IconPhone',
  isNullable: true,
});
