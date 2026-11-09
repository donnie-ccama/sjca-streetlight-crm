import { defineField, FieldType } from 'twenty-sdk/define';

import {
  LANDING_PAGE_OBJECT_ID,
  LANDING_PAGE_SHARE_DESCRIPTION_FIELD_ID,
} from 'src/constants/marketing-identifiers';

export default defineField({
  universalIdentifier: LANDING_PAGE_SHARE_DESCRIPTION_FIELD_ID,
  objectUniversalIdentifier: LANDING_PAGE_OBJECT_ID,
  type: FieldType.TEXT,
  name: 'shareDescription',
  label: 'Share Description',
  description: 'Text in link previews on social networks',
  icon: 'IconFileDescription',
  isNullable: true,
});
