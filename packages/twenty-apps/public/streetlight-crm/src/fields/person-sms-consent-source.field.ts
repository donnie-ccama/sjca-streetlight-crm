import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { PERSON_SMS_CONSENT_SOURCE_FIELD_ID } from 'src/constants/marketing-identifiers';

export default defineField({
  universalIdentifier: PERSON_SMS_CONSENT_SOURCE_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.TEXT,
  name: 'smsConsentSource',
  label: 'SMS Consent Source',
  icon: 'IconWorld',
  isNullable: true,
});
