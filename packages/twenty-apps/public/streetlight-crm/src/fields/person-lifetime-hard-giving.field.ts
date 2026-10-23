import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { PERSON_LIFETIME_HARD_GIVING_FIELD_UID } from 'src/constants/dashboard-identifiers';

export default defineField({
  universalIdentifier: PERSON_LIFETIME_HARD_GIVING_FIELD_UID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.CURRENCY,
  name: 'lifetimeHardGiving',
  label: 'Lifetime Hard Giving',
  icon: 'IconCurrencyDollar',
  isNullable: true,
});
