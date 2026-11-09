import { isNonEmptyString } from '@sniptt/guards';

import { upsertPerson } from 'src/logic-functions/landing-page.server';
import {
  createGiftContext,
  findLandingPageLink,
} from 'src/logic-functions/online-gift.server';
import { createStaffTask } from 'src/logic-functions/staff-task.server';
import { stripeRequest } from 'src/logic-functions/stripe-client';
import { gql, rawQuery } from 'src/logic-functions/workspace-gql';
import { parseAttribution } from 'src/shared/marketing/attribution';
import { parseFormInput } from 'src/shared/marketing/form-input';
import {
  buildPledgeName,
  buildStatusTask,
  nextDonorType,
  pledgeFieldsFromSubscription,
  pledgeStatusFromSubscription,
  type StripeSubscription,
} from 'src/shared/marketing/stripe-pledge';

type StripeCustomer = {
  email: string | null;
  name: string | null;
  phone: string | null;
};

const DEFAULT_ACQUISITION_SOURCE = 'stripe';
const UTM_KEY_PREFIX = 'utm_';

const textOrNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();

  return isNonEmptyString(trimmed) ? trimmed : null;
};

const splitName = (name: string | null) => {
  if (name === null) return { firstName: '', lastName: '' };

  const splitAt = name.lastIndexOf(' ');

  return splitAt === -1
    ? { firstName: name, lastName: '' }
    : {
        firstName: name.slice(0, splitAt).trim(),
        lastName: name.slice(splitAt + 1).trim(),
      };
};

const readUtm = (metadata: Record<string, string> | null) =>
  Object.fromEntries(
    Object.entries(metadata ?? {}).filter(
      ([key, value]) =>
        key.startsWith(UTM_KEY_PREFIX) && isNonEmptyString(value),
    ),
  );

const findPledge = async (subscriptionId: string) => {
  const data = await rawQuery({
    pledges: {
      __args: {
        filter: { stripeSubscriptionId: { eq: subscriptionId } },
        first: 1,
      },
      edges: { node: { id: true, status: true } },
    },
  });
  const node = data.pledges?.edges?.[0]?.node;

  return node
    ? { id: node.id as string, status: (node.status ?? null) as string | null }
    : null;
};

// A customer with no usable email cannot match a person.
const upsertDonor = async (
  subscription: StripeSubscription,
  customer: StripeCustomer,
  landingPageSlug: string | null,
): Promise<string | null> => {
  const parsed = parseFormInput({
    ...splitName(textOrNull(customer.name)),
    email: customer.email ?? '',
    phone: customer.phone ?? '',
    smsConsent: false,
  });

  if (!parsed.ok) return null;

  const person = await upsertPerson({
    form: parsed.value,
    attribution: parseAttribution(readUtm(subscription.metadata)),
    landingPageSlug: landingPageSlug ?? DEFAULT_ACQUISITION_SOURCE,
    matchByPhone: false,
  });

  return person.personId;
};

const setMonthlyDonorType = async (personId: string) => {
  const data = await rawQuery({
    people: {
      __args: { filter: { id: { eq: personId } }, first: 1 },
      edges: { node: { id: true, donorType: true } },
    },
  });
  const current: string | null =
    data.people?.edges?.[0]?.node?.donorType ?? null;
  const next = nextDonorType(current);

  if (next === current) return;

  await gql(
    `mutation ($id: UUID!, $data: PersonUpdateInput!) {
      updatePerson(id: $id, data: $data) { id }
    }`,
    { id: personId, data: { donorType: next } },
  );
};

const shouldMakeTask = (stored: string | null, next: string): boolean =>
  next === 'DELINQUENT' ||
  (next === 'CANCELLED' &&
    (stored === 'ACTIVE' || stored === 'DELINQUENT' || stored === 'PAUSED'));

export const upsertPledgeFromSubscription = async (
  subscriptionId: string,
): Promise<{ pledgeId: string; created: boolean } | null> => {
  const subscription = await stripeRequest<StripeSubscription>({
    method: 'GET',
    path: `/v1/subscriptions/${subscriptionId}`,
  });
  const status = pledgeStatusFromSubscription(subscription.status);
  const existing = await findPledge(subscription.id);

  // The plan has not started, so there is nothing to record.
  if (status === null) {
    return existing === null ? null : { pledgeId: existing.id, created: false };
  }

  // A plan that never paid leaves no Pledge.
  if (subscription.status === 'incomplete_expired' && existing === null) {
    return null;
  }

  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;
  const customer = await stripeRequest<StripeCustomer>({
    method: 'GET',
    path: `/v1/customers/${customerId}`,
  });
  const { landingPageSlug, ...fields } = pledgeFieldsFromSubscription(
    subscription,
    status,
  );
  const personId = await upsertDonor(subscription, customer, landingPageSlug);
  const statusChanged = existing?.status !== fields.status;

  // Set before the Pledge write, so a retry after a failed write sets it again.
  if (personId !== null && statusChanged && fields.status === 'ACTIVE') {
    await setMonthlyDonorType(personId);
  }

  // Before the Pledge write, so a failure keeps the old status and a retry makes the task.
  if (
    personId !== null &&
    statusChanged &&
    shouldMakeTask(existing?.status ?? null, fields.status)
  ) {
    await createStaffTask({
      personId,
      ...buildStatusTask(fields.status as 'DELINQUENT' | 'CANCELLED'),
    });
  }

  let pledgeId: string;

  if (existing === null) {
    const data: Record<string, unknown> = {
      ...fields,
      name: buildPledgeName(
        fields.installmentAmount,
        textOrNull(customer.name),
      ),
    };

    if (personId !== null) data.donorPersonId = personId;

    const landingPage =
      landingPageSlug === null
        ? null
        : await findLandingPageLink(landingPageSlug, createGiftContext());

    if (landingPage?.landingPageId != null) {
      data.landingPageId = landingPage.landingPageId;
    }

    const created = await gql(
      `mutation ($data: PledgeCreateInput!) {
        createPledge(data: $data) { id }
      }`,
      { data },
    );

    if (!created.createPledge?.id)
      throw new Error('createPledge returned no id');

    pledgeId = created.createPledge.id;
  } else {
    // Staff may edit the name, donor, and landing page, so an update keeps them.
    const data = {
      installmentAmount: fields.installmentAmount,
      status: fields.status,
      startDate: fields.startDate,
      nextPaymentDate: fields.nextPaymentDate,
      endDate: fields.endDate,
      madeMonthlyFromOneTime: fields.madeMonthlyFromOneTime,
    };

    await gql(
      `mutation ($id: UUID!, $data: PledgeUpdateInput!) {
        updatePledge(id: $id, data: $data) { id }
      }`,
      { id: existing.id, data },
    );
    pledgeId = existing.id;
  }

  if (personId === null) {
    // Subscription ID only. The customer's details stay out of the log.
    console.log(`Subscription ${subscription.id} has no usable donor details`);
  }

  return { pledgeId, created: existing === null };
};
