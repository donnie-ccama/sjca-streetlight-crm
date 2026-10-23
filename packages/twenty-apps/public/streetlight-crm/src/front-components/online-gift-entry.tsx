import { defineFrontComponent } from 'twenty-sdk/define';

import { ONLINE_GIFT_FRONT_COMPONENT_ID } from 'src/constants/daily-giving-identifiers';
import { GiftEntryWindow } from 'src/shared/gift-entry-window';

const OnlineGiftEntry = () => <GiftEntryWindow mode="ONLINE_GIFT" />;

export default defineFrontComponent({
  universalIdentifier: ONLINE_GIFT_FRONT_COMPONENT_ID,
  name: 'online-gift-entry',
  description:
    'Focused side-panel form for recording a credit-card or ACH gift with its processor transaction reference.',
  component: OnlineGiftEntry,
});
