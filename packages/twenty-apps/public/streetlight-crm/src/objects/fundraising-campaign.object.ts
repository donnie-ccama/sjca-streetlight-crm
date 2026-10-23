import { defineObject, FieldType, RelationType } from 'twenty-sdk/define';

import { DONATION_OBJECT_UID } from 'src/constants/dashboard-identifiers';
import {
  DONATION_FUNDRAISING_CAMPAIGN_FIELD_ID,
  FUNDRAISING_CAMPAIGN_DONATIONS_FIELD_ID,
  FUNDRAISING_CAMPAIGN_END_DATE_FIELD_ID,
  FUNDRAISING_CAMPAIGN_GOAL_AMOUNT_FIELD_ID,
  FUNDRAISING_CAMPAIGN_NAME_FIELD_ID,
  FUNDRAISING_CAMPAIGN_OBJECT_ID,
  FUNDRAISING_CAMPAIGN_PLEDGES_FIELD_ID,
  FUNDRAISING_CAMPAIGN_START_DATE_FIELD_ID,
  FUNDRAISING_CAMPAIGN_STATUS_FIELD_ID,
  PLEDGE_FUNDRAISING_CAMPAIGN_FIELD_ID,
  PLEDGE_OBJECT_ID,
} from 'src/constants/donor-identifiers';

export default defineObject({
  universalIdentifier: FUNDRAISING_CAMPAIGN_OBJECT_ID,
  nameSingular: 'fundraisingCampaign',
  namePlural: 'fundraisingCampaigns',
  labelSingular: 'Fundraising Campaign',
  labelPlural: 'Fundraising Campaigns',
  description: 'A fundraising appeal or campaign',
  icon: 'IconTargetArrow',
  labelIdentifierFieldMetadataUniversalIdentifier:
    FUNDRAISING_CAMPAIGN_NAME_FIELD_ID,
  fields: [
    {
      universalIdentifier: FUNDRAISING_CAMPAIGN_NAME_FIELD_ID,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: FUNDRAISING_CAMPAIGN_GOAL_AMOUNT_FIELD_ID,
      type: FieldType.CURRENCY,
      name: 'goalAmount',
      label: 'Goal Amount',
      icon: 'IconCurrencyDollar',
      isNullable: true,
    },
    {
      universalIdentifier: FUNDRAISING_CAMPAIGN_START_DATE_FIELD_ID,
      type: FieldType.DATE,
      name: 'startDate',
      label: 'Start Date',
      icon: 'IconCalendar',
      isNullable: true,
    },
    {
      universalIdentifier: FUNDRAISING_CAMPAIGN_END_DATE_FIELD_ID,
      type: FieldType.DATE,
      name: 'endDate',
      label: 'End Date',
      icon: 'IconCalendarEvent',
      isNullable: true,
    },
    {
      universalIdentifier: FUNDRAISING_CAMPAIGN_STATUS_FIELD_ID,
      type: FieldType.SELECT,
      name: 'status',
      label: 'Status',
      icon: 'IconProgress',
      defaultValue: "'PLANNED'",
      options: [
        { value: 'PLANNED', label: 'Planned', position: 0, color: 'gray' },
        { value: 'ACTIVE', label: 'Active', position: 1, color: 'green' },
        { value: 'COMPLETED', label: 'Completed', position: 2, color: 'blue' },
        { value: 'CANCELLED', label: 'Cancelled', position: 3, color: 'red' },
      ],
    },
    {
      universalIdentifier: FUNDRAISING_CAMPAIGN_DONATIONS_FIELD_ID,
      type: FieldType.RELATION,
      name: 'donations',
      label: 'Donations',
      icon: 'IconHeartHandshake',
      relationTargetObjectMetadataUniversalIdentifier: DONATION_OBJECT_UID,
      relationTargetFieldMetadataUniversalIdentifier:
        DONATION_FUNDRAISING_CAMPAIGN_FIELD_ID,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
    {
      universalIdentifier: FUNDRAISING_CAMPAIGN_PLEDGES_FIELD_ID,
      type: FieldType.RELATION,
      name: 'pledges',
      label: 'Pledges',
      icon: 'IconCalendarDollar',
      relationTargetObjectMetadataUniversalIdentifier: PLEDGE_OBJECT_ID,
      relationTargetFieldMetadataUniversalIdentifier:
        PLEDGE_FUNDRAISING_CAMPAIGN_FIELD_ID,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
  ],
});
