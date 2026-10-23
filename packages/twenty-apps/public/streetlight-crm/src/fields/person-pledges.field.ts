import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  PERSON_PLEDGES_FIELD_ID,
  PLEDGE_DONOR_PERSON_FIELD_ID,
  PLEDGE_OBJECT_ID,
} from 'src/constants/donor-identifiers';

export default defineField({
  universalIdentifier: PERSON_PLEDGES_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RELATION,
  name: 'pledges',
  label: 'Pledges',
  description: 'Pledges made by this person.',
  icon: 'IconCalendarDollar',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: PLEDGE_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: PLEDGE_DONOR_PERSON_FIELD_ID,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
