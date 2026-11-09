import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { PERSON_ACQUISITION_SOURCE_FIELD_ID } from 'src/constants/marketing-identifiers';

export default defineField({
  universalIdentifier: PERSON_ACQUISITION_SOURCE_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.TEXT,
  name: 'acquisitionSource',
  label: 'Acquisition Source',
  icon: 'IconSpeakerphone',
  isNullable: true,
});
