import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import {
  MARKETING_RESULTS_FRONT_COMPONENT_ID,
  LANDING_PAGE_BUILDER_FRONT_COMPONENT_ID,
  LANDING_PAGE_BUILDER_TAB_ID,
  LANDING_PAGE_BUILDER_WIDGET_ID,
  LANDING_PAGE_OBJECT_ID,
  LANDING_PAGE_RESULTS_PAGE_LAYOUT_ID,
  LANDING_PAGE_RESULTS_TAB_ID,
  LANDING_PAGE_RESULTS_WIDGET_ID,
} from 'src/constants/marketing-identifiers';

export default definePageLayout({
  universalIdentifier: LANDING_PAGE_RESULTS_PAGE_LAYOUT_ID,
  name: 'Landing Page',
  type: 'RECORD_PAGE',
  isFirstTabPinned: false,
  objectUniversalIdentifier: LANDING_PAGE_OBJECT_ID,
  tabs: [
    {
      universalIdentifier: LANDING_PAGE_BUILDER_TAB_ID,
      title: 'Builder',
      position: 0,
      icon: 'IconLayoutList',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: LANDING_PAGE_BUILDER_WIDGET_ID,
          title: 'Builder',
          type: 'FRONT_COMPONENT',
          heightBehavior: 'TAB_VIEWPORT',
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier:
              LANDING_PAGE_BUILDER_FRONT_COMPONENT_ID,
          },
        },
      ],
    },
    {
      universalIdentifier: LANDING_PAGE_RESULTS_TAB_ID,
      title: 'Results',
      position: 1,
      icon: 'IconChartBar',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: LANDING_PAGE_RESULTS_WIDGET_ID,
          title: 'Results',
          type: 'FRONT_COMPONENT',
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier:
              MARKETING_RESULTS_FRONT_COMPONENT_ID,
          },
        },
      ],
    },
  ],
});
