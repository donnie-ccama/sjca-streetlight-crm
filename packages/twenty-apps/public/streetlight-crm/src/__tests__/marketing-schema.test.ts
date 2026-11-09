import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SystemPermissionFlag } from 'twenty-sdk/define';
import { describe, expect, it } from 'vitest';

import applicationConfig from 'src/application-config';
import {
  LANDING_PAGE_OBJECT_ID,
  LANDING_PAGE_PUBLISHED_AT_FIELD_ID,
  LANDING_PAGE_PUBLISHED_BY_FIELD_ID,
  LANDING_PAGE_PUBLISHED_CONTENT_FIELD_ID,
  LANDING_PAGE_PUBLISHED_PHOTOS_FIELD_ID,
  LANDING_PAGE_SECTION_OBJECT_ID,
  LANDING_PAGE_SECTION_PRIMARY_BUTTON_ACTION_FIELD_ID,
  LANDING_PAGE_SECTION_PRIMARY_BUTTON_URL_FIELD_ID,
  LANDING_PAGE_SECTION_SECONDARY_BUTTON_ACTION_FIELD_ID,
  LANDING_PAGE_SECTION_SECONDARY_BUTTON_URL_FIELD_ID,
} from 'src/constants/marketing-identifiers';
import defaultRole from 'src/default-role';
import landingPagePublishedPhotos from 'src/fields/landing-page-published-photos.field';
import { MAX_SECTIONS } from 'src/shared/marketing/sections';
import landingPage from 'src/objects/landing-page.object';
import landingPageInvite from 'src/objects/landing-page-invite.object';
import landingPageSection from 'src/objects/landing-page-section.object';
import socialAgentRole from 'src/roles/social-agent.role';
import pledge from 'src/objects/pledge.object';
import response from 'src/objects/response.object';
import socialPost from 'src/objects/social-post.object';

const objects = [
  {
    definition: landingPage,
    nameSingular: 'landingPage',
    file: 'landing-page',
  },
  {
    definition: landingPageSection,
    nameSingular: 'landingPageSection',
    file: 'landing-page-section',
  },
  {
    definition: landingPageInvite,
    nameSingular: 'landingPageInvite',
    file: 'landing-page-invite',
  },
  { definition: socialPost, nameSingular: 'socialPost', file: 'social-post' },
  { definition: response, nameSingular: 'response', file: 'response' },
];

type SelectOption = { value: string };

const getOptionValues = (
  config: { fields?: { name?: string; options?: SelectOption[] | null }[] },
  fieldName: string,
) =>
  config.fields
    ?.find((field) => field.name === fieldName)
    ?.options?.map((option) => option.value);

describe('marketing schema', () => {
  it('names each object and gives it a unique universal identifier', () => {
    const identifiers = objects.map(
      ({ definition }) => definition.config.universalIdentifier,
    );

    expect(
      objects.map(({ definition }) => definition.config.nameSingular),
    ).toEqual(objects.map(({ nameSingular }) => nameSingular));
    expect(new Set(identifiers).size).toBe(objects.length);
  });

  it('orders the social post status options', () => {
    expect(getOptionValues(socialPost.config, 'status')).toEqual([
      'DRAFT',
      'AWAITING_APPROVAL',
      'APPROVED',
      'PUBLISHED',
      'FAILED',
    ]);
  });

  it('adds a readyForReview boolean that defaults to false', () => {
    const field = socialPost.config.fields?.find(
      (candidate) => candidate.name === 'readyForReview',
    );

    expect(field?.type).toBe('BOOLEAN');
    expect(field?.defaultValue).toBe(false);
  });

  it('orders the response type options', () => {
    expect(getOptionValues(response.config, 'responseType')).toEqual([
      'VISIT',
      'GIVE_CLICK',
      'PRAY',
      'VOLUNTEER',
      'GIFT',
      'GIVING_QUESTION',
    ]);
  });

  it('marks every key variable secret except the Turnstile site key', () => {
    const variables = applicationConfig.config.applicationVariables ?? {};
    const keyNames = Object.keys(variables).filter(
      (name) => name.endsWith('_KEY') && name !== 'TURNSTILE_SITE_KEY',
    );

    expect(keyNames.length).toBeGreaterThan(0);
    for (const name of keyNames) {
      expect(variables[name].isSecret).toBe(true);
    }
  });

  it('declares every application variable from the brief', () => {
    expect(
      Object.keys(applicationConfig.config.applicationVariables ?? {}).sort(),
    ).toEqual(
      [
        'LANDING_PAGE_BASE_URL',
        'TURNSTILE_SITE_KEY',
        'TURNSTILE_SECRET_KEY',
        'POSTIZ_API_KEY',
        'RESEND_API_KEY',
        'VOLUNTEER_EMAIL_FROM',
        'VOLUNTEER_EMAIL_SUBJECT',
        'VOLUNTEER_EMAIL_BODY',
        'LANDING_PAGE_BRAND_COLOR',
        'LANDING_PAGE_ORGANIZATION_NAME',
        'GIFT_DATE_TIME_ZONE',
        'LANDING_PAGE_TAGLINE',
        'LANDING_PAGE_MAILING_ADDRESS',
        'LANDING_PAGE_LOGO_URL',
        'LANDING_PAGE_SITE_URL',
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET',
        'GIVING_CONTACT_EMAIL',
      ].sort(),
    );
  });

  it('declares GIFT_DATE_TIME_ZONE as a plain variable that defaults to UTC', () => {
    expect(
      applicationConfig.config.applicationVariables?.GIFT_DATE_TIME_ZONE,
    ).toMatchObject({ value: '' });
    expect(
      applicationConfig.config.applicationVariables?.GIFT_DATE_TIME_ZONE,
    ).not.toHaveProperty('isSecret', true);
  });

  it('adds the Stripe giving fields to landing pages and pledges', () => {
    const find = (config: { fields?: { name?: string }[] }, name: string) =>
      config.fields?.find((field) => field.name === name);

    expect(find(landingPage.config, 'giveAmounts')).toMatchObject({
      type: 'TEXT',
    });
    expect(find(landingPage.config, 'fund')).toMatchObject({
      type: 'RELATION',
    });
    expect(find(landingPage.config, 'pledges')).toMatchObject({
      type: 'RELATION',
    });
    expect(find(pledge.config, 'stripeSubscriptionId')).toMatchObject({
      type: 'TEXT',
      isUnique: true,
    });
    expect(find(pledge.config, 'landingPage')).toMatchObject({
      type: 'RELATION',
    });
    expect(find(pledge.config, 'madeMonthlyFromOneTime')).toMatchObject({
      type: 'BOOLEAN',
      defaultValue: false,
    });
  });

  it('keeps agents from changing where gifts go', () => {
    const landingPageFieldIds = new Set(
      (landingPage.config.fields ?? [])
        .filter((field) =>
          ['giveAmounts', 'fund', 'fundraisingCampaign'].includes(
            field.name ?? '',
          ),
        )
        .map((field) => field.universalIdentifier),
    );
    const blocked = (socialAgentRole.config.fieldPermissions ?? []).filter(
      (permission) =>
        permission.objectUniversalIdentifier === LANDING_PAGE_OBJECT_ID &&
        permission.canUpdateFieldValue === false,
    );

    expect(landingPageFieldIds.size).toBe(3);
    for (const fieldId of landingPageFieldIds) {
      expect(
        blocked.some(
          (permission) => permission.fieldUniversalIdentifier === fieldId,
        ),
      ).toBe(true);
    }
  });

  it('keeps tenant names out of the object files', () => {
    for (const { file } of objects) {
      const source = readFileSync(
        fileURLToPath(new URL(`../objects/${file}.object.ts`, import.meta.url)),
        'utf8',
      );

      expect(source.toLowerCase()).not.toContain('citykid');
    }
  });

  it('orders the section type and button action options', () => {
    expect(getOptionValues(landingPageSection.config, 'sectionType')).toEqual([
      'HERO',
      'STATS',
      'STORY',
      'GIVE',
      'QUOTE',
      'JOIN',
      'VOLUNTEER',
      'THANKS',
      'INVITE',
    ]);
    for (const name of ['primaryButtonAction', 'secondaryButtonAction']) {
      expect(getOptionValues(landingPageSection.config, name)).toEqual([
        'GIVE',
        'JOIN',
        'VOLUNTEER',
        'LINK',
      ]);
    }
  });

  it('offers the two page types and a nullable pageType field', () => {
    const field = landingPage.config.fields?.find(
      (candidate) => candidate.name === 'pageType',
    );

    expect(getOptionValues(landingPage.config, 'pageType')).toEqual([
      'ONE_STEP',
      'TWO_STEP',
    ]);
    expect(field?.isNullable).toBe(true);
  });

  it('adds a nullable inviteMessage text field to sections', () => {
    const field = landingPageSection.config.fields?.find(
      (candidate) => candidate.name === 'inviteMessage',
    );

    expect(field?.type).toBe('TEXT');
    expect(field?.isNullable).toBe(true);
  });

  it('declares the invite object with a unique code', () => {
    const fields = landingPageInvite.config.fields ?? [];
    const names = fields.map((field) => field.name);

    for (const name of [
      'name',
      'code',
      'landingPage',
      'senderFirstName',
      'friendFirstName',
      'sender',
      'visitorKey',
      'ipHash',
      'responses',
    ]) {
      expect(names).toContain(name);
    }
    expect(fields.find((field) => field.name === 'code')?.isUnique).toBe(true);
  });

  it('adds an invite relation to responses', () => {
    expect(response.config.fields?.map((field) => field.name)).toContain(
      'invite',
    );
  });

  it('never names a section field type', () => {
    const names = landingPageSection.config.fields?.map((field) => field.name);

    expect(names).not.toContain('type');
    expect(names).toContain('sectionType');
  });

  it('declares the new landing page application variables as plain values', () => {
    const variables = applicationConfig.config.applicationVariables ?? {};

    for (const name of [
      'LANDING_PAGE_TAGLINE',
      'LANDING_PAGE_MAILING_ADDRESS',
      'LANDING_PAGE_LOGO_URL',
      'LANDING_PAGE_SITE_URL',
    ]) {
      expect(variables[name]).toMatchObject({ value: '' });
      expect(variables[name]).not.toHaveProperty('isSecret', true);
    }
  });

  it('blocks the agent role from button actions, button URLs and publishing fields', () => {
    const blocked = (objectId: string) =>
      (socialAgentRole.config.fieldPermissions ?? [])
        .filter(
          (permission) =>
            permission.objectUniversalIdentifier === objectId &&
            permission.canUpdateFieldValue === false,
        )
        .map((permission) => permission.fieldUniversalIdentifier);

    expect(blocked(LANDING_PAGE_SECTION_OBJECT_ID).sort()).toEqual(
      [
        LANDING_PAGE_SECTION_PRIMARY_BUTTON_ACTION_FIELD_ID,
        LANDING_PAGE_SECTION_PRIMARY_BUTTON_URL_FIELD_ID,
        LANDING_PAGE_SECTION_SECONDARY_BUTTON_ACTION_FIELD_ID,
        LANDING_PAGE_SECTION_SECONDARY_BUTTON_URL_FIELD_ID,
      ].sort(),
    );
    expect(blocked(LANDING_PAGE_OBJECT_ID)).toEqual(
      expect.arrayContaining([
        LANDING_PAGE_PUBLISHED_CONTENT_FIELD_ID,
        LANDING_PAGE_PUBLISHED_AT_FIELD_ID,
        LANDING_PAGE_PUBLISHED_BY_FIELD_ID,
        LANDING_PAGE_PUBLISHED_PHOTOS_FIELD_ID,
      ]),
    );
  });

  it('lets the agent role read and update landing page sections', () => {
    const permission = socialAgentRole.config.objectPermissions?.find(
      (candidate) =>
        candidate.objectUniversalIdentifier === LANDING_PAGE_SECTION_OBJECT_ID,
    );

    expect(permission).toMatchObject({
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
    });
  });

  it('lets publishedPhotos hold a copy for every section plus the share image', () => {
    expect(landingPagePublishedPhotos.config.universalSettings).toEqual({
      maxNumberOfValues: MAX_SECTIONS + 1,
    });
  });

  it('gives the default role the upload file flag', () => {
    expect(defaultRole.config.permissionFlagUniversalIdentifiers).toContain(
      SystemPermissionFlag.UPLOAD_FILE,
    );
  });
});
