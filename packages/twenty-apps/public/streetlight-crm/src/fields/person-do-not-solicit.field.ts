import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { PERSON_DO_NOT_SOLICIT_FIELD_UID } from 'src/constants/dashboard-identifiers';

export default defineField({
  universalIdentifier: PERSON_DO_NOT_SOLICIT_FIELD_UID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.BOOLEAN,
  name: 'doNotSolicit',
  label: 'Do Not Solicit',
  icon: 'IconUserOff',
  defaultValue: false,
});
