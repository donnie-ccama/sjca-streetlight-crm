import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import {
  DAILY_GIVING_PAGE_LAYOUT_ID,
  DAILY_GIVING_TAB_ID,
  ENTRY_FRONT_COMPONENT_ID,
  TODAY_GIFTS_FRONT_COMPONENT_ID,
  WIDGET_ENTRY_FORM_ID,
  WIDGET_TODAY_TABLE_ID,
} from 'src/constants/daily-giving-identifiers';

// Daily Giving — the data-entry surface for every income stream. The
// entry widget handles quick and batch entry; the donor-aware table below
// resolves individual hard-credit donors and organization donors live.
export default definePageLayout({
  universalIdentifier: DAILY_GIVING_PAGE_LAYOUT_ID,
  name: 'Daily Giving',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: DAILY_GIVING_TAB_ID,
      title: 'Daily Entry',
      position: 0,
      icon: 'IconCurrencyDollar',
      layoutMode: PageLayoutTabLayoutMode.GRID,
      widgets: [
        {
          universalIdentifier: WIDGET_ENTRY_FORM_ID,
          title: 'Record gifts',
          type: 'FRONT_COMPONENT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.GRID,
            row: 0,
            column: 0,
            rowSpan: 8,
            columnSpan: 12,
          },
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: ENTRY_FRONT_COMPONENT_ID,
          },
        },
        {
          universalIdentifier: WIDGET_TODAY_TABLE_ID,
          title: "Today's Gifts",
          type: 'FRONT_COMPONENT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.GRID,
            row: 8,
            column: 0,
            rowSpan: 4,
            columnSpan: 12,
          },
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: TODAY_GIFTS_FRONT_COMPONENT_ID,
          },
        },
      ],
    },
  ],
});
