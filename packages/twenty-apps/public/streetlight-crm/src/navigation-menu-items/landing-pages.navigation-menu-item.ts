import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  LANDING_PAGE_OBJECT_ID,
  NAV_ITEM_LANDING_PAGES_ID,
} from 'src/constants/marketing-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: NAV_ITEM_LANDING_PAGES_ID,
  name: 'Landing Pages',
  icon: 'IconWorld',
  position: 9,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: LANDING_PAGE_OBJECT_ID,
});
