import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  NAV_ITEM_SOCIAL_POSTS_ID,
  SOCIAL_POST_OBJECT_ID,
} from 'src/constants/marketing-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: NAV_ITEM_SOCIAL_POSTS_ID,
  name: 'Social Posts',
  icon: 'IconSpeakerphone',
  position: 8,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: SOCIAL_POST_OBJECT_ID,
});
