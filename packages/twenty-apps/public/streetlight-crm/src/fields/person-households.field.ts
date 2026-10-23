import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  HOUSEHOLD_OBJECT_ID,
  HOUSEHOLD_PRIMARY_CONTACT_FIELD_ID,
  PERSON_HOUSEHOLDS_FIELD_ID,
} from 'src/constants/donor-identifiers';

export default defineField({
  universalIdentifier: PERSON_HOUSEHOLDS_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RELATION,
  name: 'households',
  label: 'Households',
  description: 'Households for which this person is the primary contact.',
  icon: 'IconHome',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: HOUSEHOLD_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    HOUSEHOLD_PRIMARY_CONTACT_FIELD_ID,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
