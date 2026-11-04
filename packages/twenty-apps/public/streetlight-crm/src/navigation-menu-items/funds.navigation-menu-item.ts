import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  FUND_OBJECT_ID,
  NAV_ITEM_FUNDS_ID,
} from 'src/constants/donor-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: NAV_ITEM_FUNDS_ID,
  name: 'Funds',
  icon: 'IconBuildingBank',
  position: 4,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: FUND_OBJECT_ID,
});
