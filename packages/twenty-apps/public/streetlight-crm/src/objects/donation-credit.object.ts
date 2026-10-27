import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { DONATION_OBJECT_UID } from 'src/constants/dashboard-identifiers';
import {
  DONATION_CREDIT_CREDIT_AMOUNT_FIELD_ID,
  DONATION_CREDIT_CREDIT_ROLE_FIELD_ID,
  DONATION_CREDIT_CREDIT_TYPE_FIELD_ID,
  DONATION_CREDIT_DONATION_FIELD_ID,
  DONATION_CREDIT_INCLUDE_IN_STATEMENT_FIELD_ID,
  DONATION_CREDIT_NAME_FIELD_ID,
  DONATION_CREDIT_OBJECT_ID,
  DONATION_CREDIT_PERSON_FIELD_ID,
  DONATION_CREDIT_THANKED_FIELD_ID,
  DONATION_DONATION_CREDITS_FIELD_ID,
  PERSON_DONATION_CREDITS_FIELD_ID,
} from 'src/constants/donor-identifiers';

export default defineObject({
  universalIdentifier: DONATION_CREDIT_OBJECT_ID,
  nameSingular: 'donationCredit',
  namePlural: 'donationCredits',
  labelSingular: 'Donation Credit',
  labelPlural: 'Donation Credits',
  description: 'Hard or soft donor credit allocated to a gift',
  icon: 'IconArrowsSplit',
  labelIdentifierFieldMetadataUniversalIdentifier: DONATION_CREDIT_NAME_FIELD_ID,
  fields: [
    {
      universalIdentifier: DONATION_CREDIT_NAME_FIELD_ID,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: DONATION_CREDIT_CREDIT_TYPE_FIELD_ID,
      type: FieldType.SELECT,
      name: 'creditType',
      label: 'Credit Type',
      icon: 'IconArrowsSplit',
      defaultValue: "'HARD'",
      options: [
        { value: 'HARD', label: 'Hard', position: 0, color: 'blue' },
        { value: 'SOFT', label: 'Soft', position: 1, color: 'purple' },
      ],
    },
    {
      universalIdentifier: DONATION_CREDIT_CREDIT_ROLE_FIELD_ID,
      type: FieldType.SELECT,
      name: 'creditRole',
      label: 'Credit Role',
      icon: 'IconUsers',
      defaultValue: "'DONOR'",
      options: [
        { value: 'DONOR', label: 'Donor', position: 0, color: 'blue' },
        { value: 'SOFT_CREDIT', label: 'Soft Credit', position: 1, color: 'purple' },
        {
          value: 'MATCHING_GIFT',
          label: 'Matching Gift',
          position: 2,
          color: 'green',
        },
        {
          value: 'TRIBUTE_HONOREE',
          label: 'Tribute Honoree',
          position: 3,
          color: 'pink',
        },
        {
          value: 'HOUSEHOLD_MEMBER',
          label: 'Household Member',
          position: 4,
          color: 'turquoise',
        },
        { value: 'SOLICITOR', label: 'Solicitor', position: 5, color: 'orange' },
        { value: 'INFLUENCER', label: 'Influencer', position: 6, color: 'amber' },
      ],
    },
    {
      universalIdentifier: DONATION_CREDIT_CREDIT_AMOUNT_FIELD_ID,
      type: FieldType.CURRENCY,
      name: 'creditAmount',
      label: 'Credit Amount',
      icon: 'IconCurrencyDollar',
    },
    {
      universalIdentifier: DONATION_CREDIT_INCLUDE_IN_STATEMENT_FIELD_ID,
      type: FieldType.BOOLEAN,
      name: 'includeInStatement',
      label: 'Include In Statement',
      icon: 'IconFileCheck',
      defaultValue: true,
    },
    {
      universalIdentifier: DONATION_CREDIT_THANKED_FIELD_ID,
      type: FieldType.BOOLEAN,
      name: 'thanked',
      label: 'Thanked',
      icon: 'IconMailCheck',
      defaultValue: false,
    },
    {
      universalIdentifier: DONATION_CREDIT_DONATION_FIELD_ID,
      type: FieldType.RELATION,
      name: 'donation',
      label: 'Donation',
      icon: 'IconHeartHandshake',
      relationTargetObjectMetadataUniversalIdentifier: DONATION_OBJECT_UID,
      relationTargetFieldMetadataUniversalIdentifier:
        DONATION_DONATION_CREDITS_FIELD_ID,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.CASCADE,
        joinColumnName: 'donationId',
      },
    },
    {
      universalIdentifier: DONATION_CREDIT_PERSON_FIELD_ID,
      type: FieldType.RELATION,
      name: 'person',
      label: 'Person',
      icon: 'IconUser',
      relationTargetObjectMetadataUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
      relationTargetFieldMetadataUniversalIdentifier:
        PERSON_DONATION_CREDITS_FIELD_ID,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.CASCADE,
        joinColumnName: 'personId',
      },
    },
  ],
});
