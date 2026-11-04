import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { DONATION_OBJECT_UID } from 'src/constants/dashboard-identifiers';
import { NAV_ITEM_DONATIONS_ID } from 'src/constants/donor-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: NAV_ITEM_DONATIONS_ID,
  name: 'Donations',
  icon: 'IconCurrencyDollar',
  position: 2,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: DONATION_OBJECT_UID,
});
