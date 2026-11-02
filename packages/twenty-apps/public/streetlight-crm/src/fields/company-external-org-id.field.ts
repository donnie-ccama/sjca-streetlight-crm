import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { COMPANY_EXTERNAL_ORG_ID_FIELD_ID } from 'src/constants/donor-identifiers';

export default defineField({
  universalIdentifier: COMPANY_EXTERNAL_ORG_ID_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  type: FieldType.TEXT,
  name: 'externalOrgId',
  label: 'External Organization ID',
  icon: 'IconFingerprint',
  isNullable: true,
  isUnique: true,
});
