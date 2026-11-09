import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  LANDING_PAGE_INVITE_OBJECT_ID,
  LANDING_PAGE_INVITE_SENDER_FIELD_ID,
  PERSON_LANDING_PAGE_INVITES_FIELD_ID,
} from 'src/constants/marketing-identifiers';

export default defineField({
  universalIdentifier: PERSON_LANDING_PAGE_INVITES_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RELATION,
  name: 'landingPageInvites',
  label: 'Landing Page Invites',
  icon: 'IconUserPlus',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    LANDING_PAGE_INVITE_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    LANDING_PAGE_INVITE_SENDER_FIELD_ID,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
