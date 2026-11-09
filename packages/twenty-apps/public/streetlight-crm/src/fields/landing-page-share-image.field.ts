import { defineField, FieldType } from 'twenty-sdk/define';

import {
  LANDING_PAGE_OBJECT_ID,
  LANDING_PAGE_SHARE_IMAGE_FIELD_ID,
} from 'src/constants/marketing-identifiers';

export default defineField({
  universalIdentifier: LANDING_PAGE_SHARE_IMAGE_FIELD_ID,
  objectUniversalIdentifier: LANDING_PAGE_OBJECT_ID,
  type: FieldType.FILES,
  name: 'shareImage',
  label: 'Share Image',
  description: 'Image in link previews on social networks',
  icon: 'IconPhoto',
  isNullable: true,
  universalSettings: { maxNumberOfValues: 1 },
});
