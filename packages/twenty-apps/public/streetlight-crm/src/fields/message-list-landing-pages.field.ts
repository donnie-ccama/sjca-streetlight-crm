import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  LANDING_PAGE_OBJECT_ID,
  LANDING_PAGE_PRAYER_LIST_FIELD_ID,
  MESSAGE_LIST_LANDING_PAGES_FIELD_ID,
} from 'src/constants/marketing-identifiers';
export default defineField({
  universalIdentifier: MESSAGE_LIST_LANDING_PAGES_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageList.universalIdentifier,
  type: FieldType.RELATION,
  name: 'landingPages',
  label: 'Landing Pages',
  icon: 'IconWorld',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: LANDING_PAGE_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    LANDING_PAGE_PRAYER_LIST_FIELD_ID,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
