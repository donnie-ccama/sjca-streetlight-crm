import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { NAV_ITEM_CAMPAIGNS_ID } from 'src/constants/donor-identifiers';

// Twenty dropped its own Campaigns sidebar item in 2.25, so the app adds one.
export default defineNavigationMenuItem({
  universalIdentifier: NAV_ITEM_CAMPAIGNS_ID,
  name: 'Campaigns',
  icon: 'IconMail',
  position: 7,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageCampaign.universalIdentifier,
});
