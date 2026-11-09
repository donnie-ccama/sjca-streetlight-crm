import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  SOCIAL_POST_APPROVED_BY_FIELD_ID,
  SOCIAL_POST_OBJECT_ID,
  WORKSPACE_MEMBER_APPROVED_SOCIAL_POSTS_FIELD_ID,
} from 'src/constants/marketing-identifiers';
export default defineField({
  universalIdentifier: WORKSPACE_MEMBER_APPROVED_SOCIAL_POSTS_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  type: FieldType.RELATION,
  name: 'approvedSocialPosts',
  label: 'Approved Social Posts',
  icon: 'IconUserCheck',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: SOCIAL_POST_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    SOCIAL_POST_APPROVED_BY_FIELD_ID,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
