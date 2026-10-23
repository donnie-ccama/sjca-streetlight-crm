import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { DONATION_OBJECT_UID } from 'src/constants/dashboard-identifiers';
import {
  COMPANY_DONATIONS_FIELD_ID,
  DONATION_COMPANY_FIELD_ID,
} from 'src/constants/donor-identifiers';

export default defineField({
  universalIdentifier: COMPANY_DONATIONS_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  type: FieldType.RELATION,
  name: 'donations',
  label: 'Donations',
  description: 'Donations attributed directly to this company.',
  icon: 'IconHeartHandshake',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: DONATION_OBJECT_UID,
  relationTargetFieldMetadataUniversalIdentifier: DONATION_COMPANY_FIELD_ID,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
