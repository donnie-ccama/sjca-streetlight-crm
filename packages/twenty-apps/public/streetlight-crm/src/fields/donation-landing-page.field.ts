import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import { DONATION_OBJECT_UID } from 'src/constants/dashboard-identifiers';
import {
  DONATION_LANDING_PAGE_FIELD_ID,
  LANDING_PAGE_DONATIONS_FIELD_ID,
  LANDING_PAGE_OBJECT_ID,
} from 'src/constants/marketing-identifiers';

export default defineField({
  universalIdentifier: DONATION_LANDING_PAGE_FIELD_ID,
  objectUniversalIdentifier: DONATION_OBJECT_UID,
  type: FieldType.RELATION,
  name: 'landingPage',
  label: 'Landing Page',
  icon: 'IconWorld',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: LANDING_PAGE_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    LANDING_PAGE_DONATIONS_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'landingPageId',
  },
});
