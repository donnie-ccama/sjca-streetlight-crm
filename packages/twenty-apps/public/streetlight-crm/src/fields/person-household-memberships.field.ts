import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  HOUSEHOLD_MEMBER_OBJECT_ID,
  HOUSEHOLD_MEMBER_PERSON_FIELD_ID,
  PERSON_HOUSEHOLD_MEMBERSHIPS_FIELD_ID,
} from 'src/constants/donor-identifiers';

export default defineField({
  universalIdentifier: PERSON_HOUSEHOLD_MEMBERSHIPS_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RELATION,
  name: 'householdMemberships',
  label: 'Household Memberships',
  description: 'Household membership records for this person.',
  icon: 'IconUsers',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: HOUSEHOLD_MEMBER_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    HOUSEHOLD_MEMBER_PERSON_FIELD_ID,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
