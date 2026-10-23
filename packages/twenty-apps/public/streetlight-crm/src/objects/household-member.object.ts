import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  HOUSEHOLD_MEMBER_HOUSEHOLD_FIELD_ID,
  HOUSEHOLD_MEMBER_IS_ACTIVE_FIELD_ID,
  HOUSEHOLD_MEMBER_NAME_FIELD_ID,
  HOUSEHOLD_MEMBER_OBJECT_ID,
  HOUSEHOLD_MEMBER_PERSON_FIELD_ID,
  HOUSEHOLD_MEMBER_RECEIVE_HOUSEHOLD_SOFT_CREDIT_FIELD_ID,
  HOUSEHOLD_MEMBER_ROLE_FIELD_ID,
  HOUSEHOLD_MEMBERS_FIELD_ID,
  HOUSEHOLD_OBJECT_ID,
  PERSON_HOUSEHOLD_MEMBERSHIPS_FIELD_ID,
} from 'src/constants/donor-identifiers';

export default defineObject({
  universalIdentifier: HOUSEHOLD_MEMBER_OBJECT_ID,
  nameSingular: 'householdMember',
  namePlural: 'householdMembers',
  labelSingular: 'Household Member',
  labelPlural: 'Household Members',
  description: 'A person membership in a donor household',
  icon: 'IconUsers',
  labelIdentifierFieldMetadataUniversalIdentifier:
    HOUSEHOLD_MEMBER_NAME_FIELD_ID,
  fields: [
    {
      universalIdentifier: HOUSEHOLD_MEMBER_NAME_FIELD_ID,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: HOUSEHOLD_MEMBER_ROLE_FIELD_ID,
      type: FieldType.SELECT,
      name: 'memberRole',
      label: 'Role',
      icon: 'IconUsersGroup',
      options: [
        { value: 'HEAD', label: 'Head', position: 0, color: 'blue' },
        { value: 'SPOUSE', label: 'Spouse', position: 1, color: 'purple' },
        { value: 'CHILD', label: 'Child', position: 2, color: 'green' },
        { value: 'OTHER', label: 'Other', position: 3, color: 'gray' },
      ],
    },
    {
      universalIdentifier: HOUSEHOLD_MEMBER_IS_ACTIVE_FIELD_ID,
      type: FieldType.BOOLEAN,
      name: 'isActive',
      label: 'Is Active',
      icon: 'IconCircleCheck',
      defaultValue: true,
    },
    {
      universalIdentifier:
        HOUSEHOLD_MEMBER_RECEIVE_HOUSEHOLD_SOFT_CREDIT_FIELD_ID,
      type: FieldType.BOOLEAN,
      name: 'receiveHouseholdSoftCredit',
      label: 'Receive Household Soft Credit',
      icon: 'IconArrowsSplit',
      defaultValue: false,
    },
    {
      universalIdentifier: HOUSEHOLD_MEMBER_HOUSEHOLD_FIELD_ID,
      type: FieldType.RELATION,
      name: 'household',
      label: 'Household',
      icon: 'IconHome',
      relationTargetObjectMetadataUniversalIdentifier: HOUSEHOLD_OBJECT_ID,
      relationTargetFieldMetadataUniversalIdentifier: HOUSEHOLD_MEMBERS_FIELD_ID,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.CASCADE,
        joinColumnName: 'householdId',
      },
    },
    {
      universalIdentifier: HOUSEHOLD_MEMBER_PERSON_FIELD_ID,
      type: FieldType.RELATION,
      name: 'person',
      label: 'Person',
      icon: 'IconUser',
      relationTargetObjectMetadataUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
      relationTargetFieldMetadataUniversalIdentifier:
        PERSON_HOUSEHOLD_MEMBERSHIPS_FIELD_ID,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.CASCADE,
        joinColumnName: 'personId',
      },
    },
  ],
});
