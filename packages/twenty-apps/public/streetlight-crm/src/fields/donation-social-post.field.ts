import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import { DONATION_OBJECT_UID } from 'src/constants/dashboard-identifiers';
import {
  DONATION_SOCIAL_POST_FIELD_ID,
  SOCIAL_POST_DONATIONS_FIELD_ID,
  SOCIAL_POST_OBJECT_ID,
} from 'src/constants/marketing-identifiers';

export default defineField({
  universalIdentifier: DONATION_SOCIAL_POST_FIELD_ID,
  objectUniversalIdentifier: DONATION_OBJECT_UID,
  type: FieldType.RELATION,
  name: 'socialPost',
  label: 'Social Post',
  icon: 'IconSpeakerphone',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: SOCIAL_POST_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    SOCIAL_POST_DONATIONS_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'socialPostId',
  },
});
