import { defineView, ViewType, ViewVisibility } from 'twenty-sdk/define';

import {
  LANDING_PAGES_VIEW_ID,
  LANDING_PAGE_NAME_FIELD_ID,
  LANDING_PAGE_OBJECT_ID,
  LANDING_PAGE_SLUG_FIELD_ID,
  LANDING_PAGE_STATUS_FIELD_ID,
} from 'src/constants/marketing-identifiers';

export default defineView({
  universalIdentifier: LANDING_PAGES_VIEW_ID,
  name: 'Landing Pages',
  objectUniversalIdentifier: LANDING_PAGE_OBJECT_ID,
  type: ViewType.TABLE,
  visibility: ViewVisibility.WORKSPACE,
  position: 0,
  fields: [
    { universalIdentifier: 'a154ebf0-537e-4a8d-9ffb-f2408cdaf438', fieldMetadataUniversalIdentifier: LANDING_PAGE_NAME_FIELD_ID, position: 0, isVisible: true, size: 220 },
    { universalIdentifier: 'ff9157c2-cda9-4686-97e8-cb38fd9cbb31', fieldMetadataUniversalIdentifier: LANDING_PAGE_SLUG_FIELD_ID, position: 1, isVisible: true, size: 180 },
    { universalIdentifier: 'bf86160e-ae30-4712-94ee-d4207171ce8a', fieldMetadataUniversalIdentifier: LANDING_PAGE_STATUS_FIELD_ID, position: 2, isVisible: true, size: 140 },
  ],
});
