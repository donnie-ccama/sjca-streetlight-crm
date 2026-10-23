import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  DAILY_GIVING_PAGE_LAYOUT_ID,
  NAV_ITEM_DAILY_GIVING_ID,
} from 'src/constants/daily-giving-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: NAV_ITEM_DAILY_GIVING_ID,
  name: 'Daily Giving',
  icon: 'IconCurrencyDollar',
  position: 1,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: DAILY_GIVING_PAGE_LAYOUT_ID,
});
