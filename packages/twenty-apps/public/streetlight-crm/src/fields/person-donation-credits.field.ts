import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  DONATION_CREDIT_OBJECT_ID,
  DONATION_CREDIT_PERSON_FIELD_ID,
  PERSON_DONATION_CREDITS_FIELD_ID,
} from 'src/constants/donor-identifiers';

export default defineField({
  universalIdentifier: PERSON_DONATION_CREDITS_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RELATION,
  name: 'donationCredits',
  label: 'Donation Credits',
  description: 'Hard and soft gift credits assigned to this person.',
  icon: 'IconHeartHandshake',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: DONATION_CREDIT_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    DONATION_CREDIT_PERSON_FIELD_ID,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
