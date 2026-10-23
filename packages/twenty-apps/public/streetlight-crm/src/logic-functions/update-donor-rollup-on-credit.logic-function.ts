import { defineLogicFunction } from 'twenty-sdk/define';
import type {
  DatabaseEventPayload,
  ObjectRecordCreateEvent,
} from 'twenty-sdk/logic-function';

import { UPDATE_DONOR_ROLLUP_ON_CREDIT_LOGIC_FUNCTION_ID } from 'src/constants/donor-identifiers';
import { gql } from 'src/logic-functions/workspace-gql';
import {
  computeRollup,
  fetchHardCreditsForPerson,
  writePersonRollup,
} from 'src/logic-functions/donor-rollups';

// Real-time donor-rollup refresh. Fires on every hard-credit DonationCredit
// creation and recomputes that one Person's rollup fields from all their
// hard credits. Keeps donor statistics fresh within seconds of a new gift
// without waiting for the nightly cron sweep (recompute-donor-rollups).
//
// Trigger: donationCredit.created (DB event). The handler inspects the
// created credit's creditType and personId, and short-circuits for soft
// credits (soft totals live on Person.lifetimeSoftGiving, a separate rollup)
// or orphan credits with no linked Person.
//
// Data access is raw GraphQL via workspace-gql: the generated client's
// app-scoped schema rejects donationCredits at runtime.

type DonationCredit = {
  id: string;
  creditType?: string;
  personId?: string;
};

type DonationCreditCreatedEvent = DatabaseEventPayload<
  ObjectRecordCreateEvent<DonationCredit>
>;

const refreshPersonRollup = async (
  donationCreditId: string,
  personId: string,
) => {
  const rows = await fetchHardCreditsForPerson(personId);
  const rollup = computeRollup(rows);
  await writePersonRollup(personId, rollup);

  return {
    donationCreditId,
    personId,
    lifetimeHardGivingMicros: rollup.lifetimeHardGivingMicros.toString(),
    firstGiftDate: rollup.firstGiftDate ?? null,
    lastGiftDate: rollup.lastGiftDate ?? null,
    hardCreditCount: rollup.creditCount,
    refreshedAt: new Date().toISOString(),
  };
};

const fetchCreditPerson = async (
  donationCreditId: string,
): Promise<string | undefined> => {
  // personId filter form verified against the live workspace.
  const data = await gql(
    `query {
      donationCredits(filter: {id: {eq: "${donationCreditId}"}}, first: 1) {
        edges { node { id creditType person { id } } }
      }
    }`,
  );
  const node = data.donationCredits?.edges?.[0]?.node;
  if (!node) return undefined;
  if (node.creditType && node.creditType !== 'HARD') return undefined;
  return node.person?.id ?? undefined;
};

const handler = async (event: DonationCreditCreatedEvent) => {
  const credit = event.properties.after;

  // Soft credits don't contribute to lifetimeHardGiving. Soft rollups are a
  // separate concern; if needed later, add a parallel function keyed on
  // creditType=SOFT writing lifetimeSoftGiving.
  if (credit.creditType && credit.creditType !== 'HARD') {
    return {
      skipped: true,
      reason: `creditType=${credit.creditType ?? 'null'} (only HARD triggers hard rollup)`,
      donationCreditId: credit.id,
    };
  }

  // The created credit's person relation is the FK column on the row. If
  // absent (orphan credit), there is no Person to roll up to.
  const personId = credit.personId ?? (await fetchCreditPerson(credit.id));
  if (!personId) {
    return {
      skipped: true,
      reason: 'no person linked to this DonationCredit',
      donationCreditId: credit.id,
    };
  }

  return refreshPersonRollup(credit.id, personId);
};

export default defineLogicFunction({
  universalIdentifier: UPDATE_DONOR_ROLLUP_ON_CREDIT_LOGIC_FUNCTION_ID,
  name: 'update-donor-rollup-on-credit',
  description:
    'Refreshes a single Person\'s NPSP-style donor statistics (lifetimeHardGiving, firstGiftDate, ' +
    'lastGiftDate) when a hard-credit DonationCredit is created. Keeps donor rollups fresh in real ' +
    'time; the nightly recompute-donor-rollups cron catches drift this function might miss.',
  timeoutSeconds: 30,
  handler,
  databaseEventTriggerSettings: {
    eventName: 'donationCredit.created',
  },
});
