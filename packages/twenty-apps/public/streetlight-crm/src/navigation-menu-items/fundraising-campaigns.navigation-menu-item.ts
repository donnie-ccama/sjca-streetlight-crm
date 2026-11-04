import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  FUNDRAISING_CAMPAIGN_OBJECT_ID,
  NAV_ITEM_FUNDRAISING_CAMPAIGNS_ID,
} from 'src/constants/donor-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: NAV_ITEM_FUNDRAISING_CAMPAIGNS_ID,
  name: 'Fundraising Campaigns',
  icon: 'IconSpeakerphone',
  position: 6,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: FUNDRAISING_CAMPAIGN_OBJECT_ID,
});
