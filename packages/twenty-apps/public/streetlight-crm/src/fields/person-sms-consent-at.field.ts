import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { PERSON_SMS_CONSENT_AT_FIELD_ID } from 'src/constants/marketing-identifiers';

export default defineField({
  universalIdentifier: PERSON_SMS_CONSENT_AT_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.DATE_TIME,
  name: 'smsConsentAt',
  label: 'SMS Consent At',
  icon: 'IconCalendarCheck',
  isNullable: true,
});
