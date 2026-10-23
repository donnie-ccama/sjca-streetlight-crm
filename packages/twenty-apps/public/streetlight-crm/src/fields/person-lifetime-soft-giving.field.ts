import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { PERSON_LIFETIME_SOFT_GIVING_FIELD_ID } from 'src/constants/donor-identifiers';

export default defineField({
  universalIdentifier: PERSON_LIFETIME_SOFT_GIVING_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.CURRENCY,
  name: 'lifetimeSoftGiving',
  label: 'Lifetime Soft Giving',
  icon: 'IconCurrencyDollar',
  isNullable: true,
});
