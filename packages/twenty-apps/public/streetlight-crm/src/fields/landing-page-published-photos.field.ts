import { defineField, FieldType } from 'twenty-sdk/define';

import {
  LANDING_PAGE_OBJECT_ID,
  LANDING_PAGE_PUBLISHED_PHOTOS_FIELD_ID,
} from 'src/constants/marketing-identifiers';

export default defineField({
  universalIdentifier: LANDING_PAGE_PUBLISHED_PHOTOS_FIELD_ID,
  objectUniversalIdentifier: LANDING_PAGE_OBJECT_ID,
  type: FieldType.FILES,
  name: 'publishedPhotos',
  label: 'Published Photos',
  description:
    'Copies of the draft photos that the published page uses. Set only by Publish.',
  icon: 'IconPhotoCheck',
  isNullable: true,
  universalSettings: { maxNumberOfValues: 41 },
});
