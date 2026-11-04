import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  HOUSEHOLD_OBJECT_ID,
  NAV_ITEM_HOUSEHOLDS_ID,
} from 'src/constants/donor-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: NAV_ITEM_HOUSEHOLDS_ID,
  name: 'Households',
  icon: 'IconHome',
  position: 3,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: HOUSEHOLD_OBJECT_ID,
});
