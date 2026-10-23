import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  DONOR_DASHBOARD_PAGE_LAYOUT_ID,
  NAV_ITEM_DONOR_DASHBOARD_ID,
} from 'src/constants/dashboard-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: NAV_ITEM_DONOR_DASHBOARD_ID,
  name: 'Donor Dashboard',
  icon: 'IconLayoutDashboard',
  position: 0,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: DONOR_DASHBOARD_PAGE_LAYOUT_ID,
});