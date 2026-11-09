import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  LANDING_PAGE_OBJECT_ID,
  LANDING_PAGE_PUBLISHED_BY_FIELD_ID,
  WORKSPACE_MEMBER_PUBLISHED_LANDING_PAGES_FIELD_ID,
} from 'src/constants/marketing-identifiers';

export default defineField({
  universalIdentifier: WORKSPACE_MEMBER_PUBLISHED_LANDING_PAGES_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  type: FieldType.RELATION,
  name: 'publishedLandingPages',
  label: 'Published Landing Pages',
  icon: 'IconWorld',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: LANDING_PAGE_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    LANDING_PAGE_PUBLISHED_BY_FIELD_ID,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
