import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  DONOR_COUNT_FIELD_UID,
  GIFT_COUNT_FIELD_UID,
  MONTHLY_GIVING_POINT_OBJECT_UID,
  PERIOD_LABEL_FIELD_UID,
  SORT_KEY_FIELD_UID,
  TOTAL_AMOUNT_FIELD_UID,
} from 'src/constants/dashboard-identifiers';

export default defineObject({
  universalIdentifier: MONTHLY_GIVING_POINT_OBJECT_UID,
  nameSingular: 'monthlyGivingPoint',
  namePlural: 'monthlyGivingPoints',
  labelSingular: 'Monthly Giving',
  labelPlural: 'Monthly Giving Points',
  description: 'Monthly giving totals used by the donor dashboard',
  icon: 'IconChartBar',
  labelIdentifierFieldMetadataUniversalIdentifier: PERIOD_LABEL_FIELD_UID,
  fields: [
    {
      universalIdentifier: PERIOD_LABEL_FIELD_UID,
      type: FieldType.TEXT,
      name: 'periodLabel',
      label: 'Period',
      icon: 'IconCalendarMonth',
      isUnique: true,
    },
    {
      universalIdentifier: SORT_KEY_FIELD_UID,
      type: FieldType.NUMBER,
      name: 'sortKey',
      label: 'Sort Key',
      icon: 'IconSortAscending',
    },
    {
      universalIdentifier: TOTAL_AMOUNT_FIELD_UID,
      type: FieldType.CURRENCY,
      name: 'totalAmount',
      label: 'Total Amount',
      icon: 'IconCurrencyDollar',
    },
    {
      universalIdentifier: GIFT_COUNT_FIELD_UID,
      type: FieldType.NUMBER,
      name: 'giftCount',
      label: 'Gifts',
      icon: 'IconGift',
    },
    {
      universalIdentifier: DONOR_COUNT_FIELD_UID,
      type: FieldType.NUMBER,
      name: 'donorCount',
      label: 'Donors',
      icon: 'IconUsers',
    },
  ],
});
