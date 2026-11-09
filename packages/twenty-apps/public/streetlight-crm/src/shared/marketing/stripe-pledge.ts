import { isNonEmptyString } from '@sniptt/guards';

export type StripeSubscription = {
  id: string;
  status: string;
  customer: string | { id: string };
  start_date: number;
  canceled_at: number | null;
  ended_at: number | null;
  metadata: Record<string, string> | null;
  items: {
    data: {
      current_period_end?: number | null;
      price: { unit_amount: number | null; currency: string } | null;
    }[];
  };
};

export type PledgeStatus = 'ACTIVE' | 'DELINQUENT' | 'CANCELLED' | 'PAUSED';

const PLEDGE_STATUS_BY_SUBSCRIPTION_STATUS: Record<string, PledgeStatus> = {
  active: 'ACTIVE',
  trialing: 'ACTIVE',
  past_due: 'DELINQUENT',
  unpaid: 'DELINQUENT',
  canceled: 'CANCELLED',
  incomplete_expired: 'CANCELLED',
  paused: 'PAUSED',
};

const MICROS_PER_CENT = 10_000n;
const PLEDGE_CURRENCY = 'USD';

// Null (incomplete or unknown) means the plan has not started, so nothing is written.
export const pledgeStatusFromSubscription = (
  status: string,
): PledgeStatus | null =>
  Object.prototype.hasOwnProperty.call(
    PLEDGE_STATUS_BY_SUBSCRIPTION_STATUS,
    status,
  )
    ? PLEDGE_STATUS_BY_SUBSCRIPTION_STATUS[status]
    : null;

export const nextDonorType = (current: string | null): string | null =>
  current === 'MAJOR' || current === 'BOARD' ? current : 'MONTHLY';

const toDate = (epochSeconds: number | null | undefined): string | null =>
  typeof epochSeconds === 'number'
    ? new Date(epochSeconds * 1000).toISOString().slice(0, 10)
    : null;

export const pledgeFieldsFromSubscription = (
  subscription: StripeSubscription,
  status: PledgeStatus,
) => {
  const item = subscription.items.data[0];
  const unitAmount = item?.price?.unit_amount;
  const landingPageSlug = subscription.metadata?.lp_slug?.trim();

  return {
    stripeSubscriptionId: subscription.id,
    commitmentType: 'RECURRING',
    frequency: 'MONTHLY',
    status,
    installmentAmount:
      typeof unitAmount === 'number'
        ? {
            amountMicros: (BigInt(unitAmount) * MICROS_PER_CENT).toString(),
            currencyCode: PLEDGE_CURRENCY,
          }
        : null,
    startDate: toDate(subscription.start_date),
    nextPaymentDate:
      status === 'ACTIVE' ? toDate(item?.current_period_end) : null,
    endDate:
      status === 'CANCELLED'
        ? toDate(subscription.ended_at ?? subscription.canceled_at)
        : null,
    landingPageSlug: landingPageSlug === '' ? null : (landingPageSlug ?? null),
    madeMonthlyFromOneTime: isNonEmptyString(
      subscription.metadata?.made_monthly_from?.trim(),
    ),
  };
};

export const buildPledgeName = (
  installmentAmount: { amountMicros: string } | null,
  donorName: string | null,
): string => {
  const dollars =
    installmentAmount === null
      ? null
      : Number(BigInt(installmentAmount.amountMicros) / MICROS_PER_CENT) / 100;
  const amountText = dollars === null ? '' : ` $${dollars.toFixed(2)}`;

  return `Monthly gift${amountText}${donorName === null ? '' : ` · ${donorName}`}`;
};

export const buildStatusTask = (
  status: 'DELINQUENT' | 'CANCELLED',
): { title: string; body: string } =>
  status === 'DELINQUENT'
    ? {
        title: 'Monthly gift failed: contact the donor',
        body: 'The last monthly charge failed. Stripe retries the charge and emails the donor. Contact the donor if the charge keeps failing.',
      }
    : {
        title: 'Monthly gift canceled: set the donor type',
        body: 'The monthly gift is canceled. Set the donor type of this person. Contact the donor if the cancel was not on purpose.',
      };
