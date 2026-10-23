import { defineFrontComponent } from 'twenty-sdk/define';

import { CASH_DEPOSIT_FRONT_COMPONENT_ID } from 'src/constants/daily-giving-identifiers';
import { GiftEntryWindow } from 'src/shared/gift-entry-window';

const CashDepositEntry = () => <GiftEntryWindow mode="CASH_DEPOSIT" />;

export default defineFrontComponent({
  universalIdentifier: CASH_DEPOSIT_FRONT_COMPONENT_ID,
  name: 'cash-deposit-entry',
  description:
    'Focused side-panel form for recording a donor cash gift and its bank deposit date.',
  component: CashDepositEntry,
});
