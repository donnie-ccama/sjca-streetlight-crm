import { defineCommandMenuItem } from 'twenty-sdk/define';

import {
  CASH_DEPOSIT_FRONT_COMPONENT_ID,
  RECORD_CASH_DEPOSIT_COMMAND_ID,
} from 'src/constants/daily-giving-identifiers';

export default defineCommandMenuItem({
  universalIdentifier: RECORD_CASH_DEPOSIT_COMMAND_ID,
  label: 'Record Cash Deposit',
  shortLabel: 'Cash Deposit',
  isPinned: true,
  availabilityType: 'GLOBAL',
  frontComponentUniversalIdentifier: CASH_DEPOSIT_FRONT_COMPONENT_ID,
});
