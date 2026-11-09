import { defineField, FieldType } from 'twenty-sdk/define';

import { DONATION_OBJECT_UID } from 'src/constants/dashboard-identifiers';
import { DONATION_UTM_RAW_FIELD_ID } from 'src/constants/marketing-identifiers';

export default defineField({
  universalIdentifier: DONATION_UTM_RAW_FIELD_ID,
  objectUniversalIdentifier: DONATION_OBJECT_UID,
  type: FieldType.RAW_JSON,
  name: 'utmRaw',
  label: 'UTM Raw',
  description: 'All UTM values as received from the donation platform',
  icon: 'IconBraces',
  isNullable: true,
});
