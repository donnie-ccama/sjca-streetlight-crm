import { defineField, FieldType } from 'twenty-sdk/define';

import { INKIND_DESCRIPTION_FIELD_ID } from 'src/constants/daily-giving-identifiers';
import { DONATION_OBJECT_UID } from 'src/constants/dashboard-identifiers';

// Extends the workspace-owned donation object (provisioned outside this
// app) so Daily Giving in-kind entries can describe the goods received.
// The amount of an in-kind gift records estimated fair market value.
export default defineField({
  universalIdentifier: INKIND_DESCRIPTION_FIELD_ID,
  objectUniversalIdentifier: DONATION_OBJECT_UID,
  name: 'inKindDescription',
  label: 'In-Kind Description',
  type: FieldType.TEXT,
  description:
    'Goods or services donated for IN_KIND gifts (e.g. "40 cases of water, 12 backpacks"). Amount holds estimated fair market value.',
});
