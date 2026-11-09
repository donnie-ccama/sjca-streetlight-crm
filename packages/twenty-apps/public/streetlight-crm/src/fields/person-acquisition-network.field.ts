import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { PERSON_ACQUISITION_NETWORK_FIELD_ID } from 'src/constants/marketing-identifiers';

export default defineField({
  universalIdentifier: PERSON_ACQUISITION_NETWORK_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.SELECT,
  name: 'acquisitionNetwork',
  label: 'Acquisition Network',
  icon: 'IconShare',
  isNullable: true,
  options: [
    { value: 'FACEBOOK', label: 'Facebook', position: 0, color: 'blue' },
    { value: 'INSTAGRAM', label: 'Instagram', position: 1, color: 'pink' },
    { value: 'TIKTOK', label: 'TikTok', position: 2, color: 'turquoise' },
    { value: 'YOUTUBE', label: 'YouTube', position: 3, color: 'red' },
    { value: 'OTHER', label: 'Other', position: 4, color: 'gray' },
    { value: 'NONE', label: 'None', position: 5, color: 'gray' },
  ],
});
