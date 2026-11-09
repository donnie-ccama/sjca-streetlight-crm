import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import {
  MARKETING_RESULTS_FRONT_COMPONENT_ID,
  SOCIAL_POST_BUILDER_TAB_ID,
  SOCIAL_POST_BUILDER_WIDGET_ID,
  SOCIAL_POST_OBJECT_ID,
  SOCIAL_POST_PREVIEW_FRONT_COMPONENT_ID,
  SOCIAL_POST_PREVIEW_TAB_ID,
  SOCIAL_POST_PREVIEW_WIDGET_ID,
  SOCIAL_POST_RESULTS_PAGE_LAYOUT_ID,
  SOCIAL_POST_RESULTS_TAB_ID,
  SOCIAL_POST_RESULTS_WIDGET_ID,
} from 'src/constants/marketing-identifiers';

export default definePageLayout({
  universalIdentifier: SOCIAL_POST_RESULTS_PAGE_LAYOUT_ID,
  name: 'Social Post',
  type: 'RECORD_PAGE',
  objectUniversalIdentifier: SOCIAL_POST_OBJECT_ID,
  tabs: [
    {
      universalIdentifier: SOCIAL_POST_BUILDER_TAB_ID,
      title: 'Builder',
      position: 0,
      icon: 'IconLayoutList',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: SOCIAL_POST_BUILDER_WIDGET_ID,
          title: 'Fields',
          type: 'FIELDS',
          configuration: {
            configurationType: 'FIELDS',
          },
        },
      ],
    },
    {
      universalIdentifier: SOCIAL_POST_PREVIEW_TAB_ID,
      title: 'Preview',
      position: 1,
      icon: 'IconEye',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: SOCIAL_POST_PREVIEW_WIDGET_ID,
          title: 'Preview',
          type: 'FRONT_COMPONENT',
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier:
              SOCIAL_POST_PREVIEW_FRONT_COMPONENT_ID,
          },
        },
      ],
    },
    {
      universalIdentifier: SOCIAL_POST_RESULTS_TAB_ID,
      title: 'Results',
      position: 2,
      icon: 'IconChartBar',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: SOCIAL_POST_RESULTS_WIDGET_ID,
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
