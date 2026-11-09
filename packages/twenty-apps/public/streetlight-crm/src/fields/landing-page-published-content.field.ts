import { defineField, FieldType } from 'twenty-sdk/define';

import {
  LANDING_PAGE_OBJECT_ID,
  LANDING_PAGE_PUBLISHED_CONTENT_FIELD_ID,
} from 'src/constants/marketing-identifiers';

export default defineField({
  universalIdentifier: LANDING_PAGE_PUBLISHED_CONTENT_FIELD_ID,
  objectUniversalIdentifier: LANDING_PAGE_OBJECT_ID,
  type: FieldType.RAW_JSON,
  name: 'publishedContent',
  label: 'Published Content',
  description:
    'The published copy of the visible sections. Set only by Publish.',
  icon: 'IconBraces',
  isNullable: true,
});
