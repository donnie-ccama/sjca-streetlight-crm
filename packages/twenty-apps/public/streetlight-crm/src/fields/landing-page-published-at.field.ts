import { defineField, FieldType } from 'twenty-sdk/define';

import {
  LANDING_PAGE_OBJECT_ID,
  LANDING_PAGE_PUBLISHED_AT_FIELD_ID,
} from 'src/constants/marketing-identifiers';

export default defineField({
  universalIdentifier: LANDING_PAGE_PUBLISHED_AT_FIELD_ID,
  objectUniversalIdentifier: LANDING_PAGE_OBJECT_ID,
  type: FieldType.DATE_TIME,
  name: 'publishedAt',
  label: 'Published At',
  description: 'Set only by Publish',
  icon: 'IconCalendarCheck',
  isNullable: true,
});
