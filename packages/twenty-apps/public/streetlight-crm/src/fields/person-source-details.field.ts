import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { PERSON_SOURCE_DETAILS_FIELD_ID } from 'src/constants/donor-identifiers';

export default defineField({
  universalIdentifier: PERSON_SOURCE_DETAILS_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RAW_JSON,
  name: 'sourceDetails',
  label: 'Source Details',
  description: 'Source-sheet fields and evidence retained for audit.',
  icon: 'IconBraces',
  isNullable: true,
  isUIEditable: false,
});
