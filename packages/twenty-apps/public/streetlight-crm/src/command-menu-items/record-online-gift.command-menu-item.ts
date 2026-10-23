import { defineCommandMenuItem } from 'twenty-sdk/define';

import {
  ONLINE_GIFT_FRONT_COMPONENT_ID,
  RECORD_ONLINE_GIFT_COMMAND_ID,
} from 'src/constants/daily-giving-identifiers';

export default defineCommandMenuItem({
  universalIdentifier: RECORD_ONLINE_GIFT_COMMAND_ID,
  label: 'Record Online Gift',
  shortLabel: 'Online Gift',
  isPinned: true,
  availabilityType: 'GLOBAL',
  frontComponentUniversalIdentifier: ONLINE_GIFT_FRONT_COMPONENT_ID,
});
