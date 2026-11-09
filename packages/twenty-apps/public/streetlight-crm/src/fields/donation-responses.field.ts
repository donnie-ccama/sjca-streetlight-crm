import { defineField, FieldType, RelationType } from 'twenty-sdk/define';
import { DONATION_OBJECT_UID } from 'src/constants/dashboard-identifiers';
import {
  DONATION_RESPONSES_FIELD_ID,
  RESPONSE_DONATION_FIELD_ID,
  RESPONSE_OBJECT_ID,
} from 'src/constants/marketing-identifiers';
export default defineField({
  universalIdentifier: DONATION_RESPONSES_FIELD_ID,
  objectUniversalIdentifier: DONATION_OBJECT_UID,
  type: FieldType.RELATION,
  name: 'responses',
  label: 'Responses',
  icon: 'IconActivity',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: RESPONSE_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: RESPONSE_DONATION_FIELD_ID,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
