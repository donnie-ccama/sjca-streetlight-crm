import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  NAV_ITEM_PLEDGES_ID,
  PLEDGE_OBJECT_ID,
} from 'src/constants/donor-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: NAV_ITEM_PLEDGES_ID,
  name: 'Pledges',
  icon: 'IconHeartHandshake',
  position: 5,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: PLEDGE_OBJECT_ID,
});
