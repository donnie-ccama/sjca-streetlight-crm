import { defineField, FieldType } from 'twenty-sdk/define';

import { ONLINE_TRANSACTION_ID_FIELD_ID } from 'src/constants/daily-giving-identifiers';
import { DONATION_OBJECT_UID } from 'src/constants/dashboard-identifiers';

// Keeps the payment processor's reference separate from
// externalTransactionId, which Daily Giving owns as its retry key.
export default defineField({
  universalIdentifier: ONLINE_TRANSACTION_ID_FIELD_ID,
  objectUniversalIdentifier: DONATION_OBJECT_UID,
  name: 'onlineTransactionId',
  label: 'Online Transaction ID',
  type: FieldType.TEXT,
  description:
    'Transaction reference supplied by the online giving processor. Used to prevent duplicate online-gift entry across browser sessions.',
});
