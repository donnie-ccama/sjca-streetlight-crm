import { defineApplication } from 'twenty-sdk/define';

import {
  APP_DESCRIPTION,
  APP_DISPLAY_NAME,
  APPLICATION_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: APP_DISPLAY_NAME,
  description: APP_DESCRIPTION,
  logo: 'public/logo.svg',
  applicationVariables: {
    LANDING_PAGE_BASE_URL: {
      universalIdentifier: 'b8df36fd-53a2-4597-b267-a33e1a4595a1',
      description:
        'Bare public host for landing pages and post links, with no path, for example https://give.example.org',
      value: '',
    },
    TURNSTILE_SITE_KEY: {
      universalIdentifier: '878e22c2-2098-44f8-aaa2-b8da331fc098',
      description: 'Cloudflare Turnstile site key (public)',
      value: '',
    },
    TURNSTILE_SECRET_KEY: {
      universalIdentifier: 'fa7c2893-63ef-4ef4-abf1-e3419e6bc18d',
      description: 'Cloudflare Turnstile secret key',
      isSecret: true,
    },
    STRIPE_SECRET_KEY: {
      universalIdentifier: 'fffd93d6-bc61-4fb7-b70d-66174e059f02',
      description: 'Stripe secret key for creating checkout sessions',
      isSecret: true,
    },
    STRIPE_WEBHOOK_SECRET: {
      universalIdentifier: '24dd4663-1eac-4c44-a56c-299599aee1a3',
      description: 'Stripe webhook signing secret',
      isSecret: true,
    },
    GIVING_CONTACT_EMAIL: {
      universalIdentifier: '089ab6bf-2e5e-4eef-80f9-69eed1438a21',
      description:
        'Email address that gets giving questions from landing pages',
      value: '',
    },
    POSTIZ_API_KEY: {
      universalIdentifier: '46a22078-4a98-4506-8308-855d4359793c',
      description: 'Postiz API key for publishing social posts',
      isSecret: true,
    },
    RESEND_API_KEY: {
      universalIdentifier: '24f2dab0-3596-40e2-b378-4dec4cdfe84e',
      description: 'Resend API key for the volunteer follow-up email',
      isSecret: true,
    },
    VOLUNTEER_EMAIL_FROM: {
      universalIdentifier: 'e8974a3a-6c0b-4b3f-9cc9-3fdcb7112815',
      description: 'From address for the volunteer follow-up email',
      value: '',
    },
    VOLUNTEER_EMAIL_SUBJECT: {
      universalIdentifier: 'cdaff631-7eb8-4f40-aa8a-d17c425b236d',
      description: 'Subject of the volunteer follow-up email',
      value: '',
    },
    VOLUNTEER_EMAIL_BODY: {
      universalIdentifier: '1e390ef5-236c-4ded-9dbf-4e1a0caea82f',
      description: 'Body of the volunteer follow-up email',
      value: '',
    },
    LANDING_PAGE_BRAND_COLOR: {
      universalIdentifier: '5e759651-eddc-4e86-bbd9-9716ca018aef',
      description: 'Accent color for landing pages, for example a hex value',
      value: '',
    },
    LANDING_PAGE_ORGANIZATION_NAME: {
      universalIdentifier: 'dc1ad09d-587e-44e9-abe5-bf042904f82c',
      description: 'Organization name shown on landing pages',
      value: '',
    },
    GIFT_DATE_TIME_ZONE: {
      universalIdentifier: 'fd549819-f388-4e04-a69d-a7f3b13ee529',
      description:
        'IANA time zone for Stripe gift dates, for example America/New_York. Empty means UTC',
      value: '',
    },
    LANDING_PAGE_TAGLINE: {
      universalIdentifier: '1e19b9d5-c93e-499c-86e4-1c120377f2be',
      description: 'Short line under the organization name in the page footer',
      value: '',
    },
    LANDING_PAGE_MAILING_ADDRESS: {
      universalIdentifier: '11d0b028-a7f1-4c6a-bbbf-8676598a9fa1',
      description: 'Mailing address shown in the page footer',
      value: '',
    },
    LANDING_PAGE_LOGO_URL: {
      universalIdentifier: 'f5c9ea4d-f1ca-47c9-b567-05687f1b23d6',
      description: 'Public https address of the logo shown in the page header',
      value: '',
    },
    LANDING_PAGE_SITE_URL: {
      universalIdentifier: '1b6711f4-dbc3-4ae7-8a99-72f5dd41c62b',
      description: 'Address of the main website, linked from the header',
      value: '',
    },
  },
});
