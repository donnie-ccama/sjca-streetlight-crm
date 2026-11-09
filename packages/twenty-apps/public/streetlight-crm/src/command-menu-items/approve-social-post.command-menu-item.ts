import { defineCommandMenuItem, isSelectAll } from 'twenty-sdk/define';

import {
  APPROVE_SOCIAL_POST_COMMAND_ID,
  APPROVE_SOCIAL_POST_FRONT_COMPONENT_ID,
  SOCIAL_POST_OBJECT_ID,
} from 'src/constants/marketing-identifiers';

export default defineCommandMenuItem({
  universalIdentifier: APPROVE_SOCIAL_POST_COMMAND_ID,
  label: 'Approve and Publish',
  shortLabel: 'Approve',
  isPinned: true,
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier: SOCIAL_POST_OBJECT_ID,
  conditionalAvailabilityExpression: !isSelectAll,
  frontComponentUniversalIdentifier: APPROVE_SOCIAL_POST_FRONT_COMPONENT_ID,
});
