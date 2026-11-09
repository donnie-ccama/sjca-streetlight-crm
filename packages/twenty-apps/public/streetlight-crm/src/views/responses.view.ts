import { defineView, ViewType, ViewVisibility } from 'twenty-sdk/define';

import {
  RESPONSES_VIEW_ID,
  RESPONSE_DONATION_FIELD_ID,
  RESPONSE_LANDING_PAGE_FIELD_ID,
  RESPONSE_NAME_FIELD_ID,
  RESPONSE_NETWORK_FIELD_ID,
  RESPONSE_OBJECT_ID,
  RESPONSE_PERSON_FIELD_ID,
  RESPONSE_SOCIAL_POST_FIELD_ID,
  RESPONSE_TYPE_FIELD_ID,
} from 'src/constants/marketing-identifiers';

export default defineView({
  universalIdentifier: RESPONSES_VIEW_ID,
  name: 'Responses',
  objectUniversalIdentifier: RESPONSE_OBJECT_ID,
  type: ViewType.TABLE,
  visibility: ViewVisibility.WORKSPACE,
  position: 0,
  fields: [
    { universalIdentifier: '7dcf8584-c04d-401f-86a3-24fde5928c1b', fieldMetadataUniversalIdentifier: RESPONSE_NAME_FIELD_ID, position: 0, isVisible: true, size: 220 },
    { universalIdentifier: '4517950b-a516-4539-a884-3b686257a228', fieldMetadataUniversalIdentifier: RESPONSE_TYPE_FIELD_ID, position: 1, isVisible: true, size: 130 },
    { universalIdentifier: '099c6b52-8916-4f69-ba52-d240b960904e', fieldMetadataUniversalIdentifier: RESPONSE_NETWORK_FIELD_ID, position: 2, isVisible: true, size: 130 },
    { universalIdentifier: 'cc6db3c6-57fe-4803-86e3-6fdf2677b81f', fieldMetadataUniversalIdentifier: RESPONSE_PERSON_FIELD_ID, position: 3, isVisible: true, size: 180 },
    { universalIdentifier: '063c751f-01ce-4820-aa68-8cdba72ef97e', fieldMetadataUniversalIdentifier: RESPONSE_LANDING_PAGE_FIELD_ID, position: 4, isVisible: true, size: 180 },
    { universalIdentifier: '73f0595e-862b-453f-9e0d-2eadc9f004d8', fieldMetadataUniversalIdentifier: RESPONSE_SOCIAL_POST_FIELD_ID, position: 5, isVisible: true, size: 180 },
    { universalIdentifier: 'c849d7ba-e104-4e4c-88d5-8b743dbda4cc', fieldMetadataUniversalIdentifier: RESPONSE_DONATION_FIELD_ID, position: 6, isVisible: true, size: 160 },
  ],
});
