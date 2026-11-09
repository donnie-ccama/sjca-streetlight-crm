import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  LANDING_PAGE_OBJECT_ID,
  LANDING_PAGE_PUBLISHED_BY_FIELD_ID,
  WORKSPACE_MEMBER_PUBLISHED_LANDING_PAGES_FIELD_ID,
} from 'src/constants/marketing-identifiers';

export default defineField({
  universalIdentifier: LANDING_PAGE_PUBLISHED_BY_FIELD_ID,
  objectUniversalIdentifier: LANDING_PAGE_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'publishedBy',
  label: 'Published By',
  description: 'Set only by Publish',
  icon: 'IconUserCheck',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier:
    WORKSPACE_MEMBER_PUBLISHED_LANDING_PAGES_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'publishedById',
  },
});
