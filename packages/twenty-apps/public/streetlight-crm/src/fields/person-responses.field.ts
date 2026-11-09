import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  PERSON_RESPONSES_FIELD_ID,
  RESPONSE_OBJECT_ID,
  RESPONSE_PERSON_FIELD_ID,
} from 'src/constants/marketing-identifiers';
export default defineField({
  universalIdentifier: PERSON_RESPONSES_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RELATION,
  name: 'responses',
  label: 'Responses',
  icon: 'IconActivity',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: RESPONSE_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: RESPONSE_PERSON_FIELD_ID,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
