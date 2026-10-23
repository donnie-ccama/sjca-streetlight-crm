import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  HOUSEHOLD_FORMAL_SALUTATION_FIELD_ID,
  HOUSEHOLD_LIFETIME_HARD_GIVING_FIELD_ID,
  HOUSEHOLD_MAILING_ADDRESS_FIELD_ID,
  HOUSEHOLD_MEMBER_HOUSEHOLD_FIELD_ID,
  HOUSEHOLD_MEMBER_OBJECT_ID,
  HOUSEHOLD_MEMBERS_FIELD_ID,
  HOUSEHOLD_NAME_FIELD_ID,
  HOUSEHOLD_OBJECT_ID,
  HOUSEHOLD_PRIMARY_CONTACT_FIELD_ID,
  PERSON_HOUSEHOLDS_FIELD_ID,
} from 'src/constants/donor-identifiers';

export default defineObject({
  universalIdentifier: HOUSEHOLD_OBJECT_ID,
  nameSingular: 'household',
  namePlural: 'households',
  labelSingular: 'Household',
  labelPlural: 'Households',
  description: 'A donor household used for joint communication and giving',
  icon: 'IconHome',
  labelIdentifierFieldMetadataUniversalIdentifier: HOUSEHOLD_NAME_FIELD_ID,
  fields: [
    {
      universalIdentifier: HOUSEHOLD_NAME_FIELD_ID,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: HOUSEHOLD_FORMAL_SALUTATION_FIELD_ID,
      type: FieldType.TEXT,
      name: 'formalSalutation',
      label: 'Formal Salutation',
      icon: 'IconMail',
      isNullable: true,
    },
    {
      universalIdentifier: HOUSEHOLD_MAILING_ADDRESS_FIELD_ID,
      type: FieldType.ADDRESS,
      name: 'mailingAddress',
      label: 'Mailing Address',
      icon: 'IconMapPin',
      isNullable: true,
    },
    {
      universalIdentifier: HOUSEHOLD_LIFETIME_HARD_GIVING_FIELD_ID,
      type: FieldType.CURRENCY,
      name: 'lifetimeHardGiving',
      label: 'Lifetime Hard Giving',
      icon: 'IconCurrencyDollar',
      isNullable: true,
    },
    {
      universalIdentifier: HOUSEHOLD_PRIMARY_CONTACT_FIELD_ID,
      type: FieldType.RELATION,
      name: 'primaryContact',
      label: 'Primary Contact',
      icon: 'IconUser',
      relationTargetObjectMetadataUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
      relationTargetFieldMetadataUniversalIdentifier: PERSON_HOUSEHOLDS_FIELD_ID,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'primaryContactId',
      },
    },
    {
      universalIdentifier: HOUSEHOLD_MEMBERS_FIELD_ID,
      type: FieldType.RELATION,
      name: 'householdMembers',
      label: 'Household Members',
      icon: 'IconUsers',
      relationTargetObjectMetadataUniversalIdentifier: HOUSEHOLD_MEMBER_OBJECT_ID,
      relationTargetFieldMetadataUniversalIdentifier:
        HOUSEHOLD_MEMBER_HOUSEHOLD_FIELD_ID,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
  ],
});
