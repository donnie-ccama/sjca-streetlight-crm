import { defineField, FieldType, RelationType } from 'twenty-sdk/define';
import { FUNDRAISING_CAMPAIGN_OBJECT_ID } from 'src/constants/donor-identifiers';
import {
  FUNDRAISING_CAMPAIGN_LANDING_PAGES_FIELD_ID,
  LANDING_PAGE_FUNDRAISING_CAMPAIGN_FIELD_ID,
  LANDING_PAGE_OBJECT_ID,
} from 'src/constants/marketing-identifiers';
export default defineField({
  universalIdentifier: FUNDRAISING_CAMPAIGN_LANDING_PAGES_FIELD_ID,
  objectUniversalIdentifier: FUNDRAISING_CAMPAIGN_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'landingPages',
  label: 'Landing Pages',
  icon: 'IconWorld',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: LANDING_PAGE_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    LANDING_PAGE_FUNDRAISING_CAMPAIGN_FIELD_ID,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
