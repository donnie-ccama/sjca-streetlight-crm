import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import {
  DONOR_DASHBOARD_FRONT_COMPONENT_ID,
  DONOR_DASHBOARD_PAGE_LAYOUT_ID,
  DONOR_DASHBOARD_TAB_ID,
  WIDGET_DONOR_DASHBOARD_ID,
} from 'src/constants/dashboard-identifiers';

// The refresh-donor-dashboard logic function computes the numbers hourly.
// The donor-dashboard front component draws the whole page.
export default definePageLayout({
  universalIdentifier: DONOR_DASHBOARD_PAGE_LAYOUT_ID,
  name: 'Donor Dashboard',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: DONOR_DASHBOARD_TAB_ID,
      title: 'Overview',
      position: 0,
      icon: 'IconLayoutDashboard',
      layoutMode: PageLayoutTabLayoutMode.GRID,
      widgets: [
        {
          universalIdentifier: WIDGET_DONOR_DASHBOARD_ID,
          title: ' ',
          type: 'FRONT_COMPONENT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.GRID,
            row: 0,
            column: 0,
            rowSpan: 26,
            columnSpan: 12,
          },
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier:
              DONOR_DASHBOARD_FRONT_COMPONENT_ID,
          },
        },
      ],
    },
  ],
});
