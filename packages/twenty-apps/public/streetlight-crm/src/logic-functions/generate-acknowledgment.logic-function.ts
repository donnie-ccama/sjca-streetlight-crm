import { defineLogicFunction } from 'twenty-sdk/define';
import type { DatabaseEventPayload, ObjectRecordCreateEvent } from 'twenty-sdk/logic-function';
import { jsonSchemaToInputSchema, type InputJsonSchema } from 'twenty-sdk/logic-function';
import { CoreApiClient } from 'twenty-client-sdk/core';

import { GENERATE_ACKNOWLEDGMENT_LOGIC_FUNCTION_ID } from 'src/constants/donor-identifiers';
import { rawQuery } from 'src/logic-functions/workspace-gql';

// The existing donor objects are workspace-owned (provisioned by
// scripts/provision-schema.py). Queries against them go through
// workspace-gql raw requests: the generated CoreApiClient validates queries
// against an app-scoped schema at RUNTIME and rejects donationCredits.
// createTask targets the standard Task object, so it keeps using the client.

type Donation = {
  id: string;
  name: string;
  amount?: { amountMicros?: string; currencyCode?: string };
  giftDate?: string;
  paymentMethod?: string;
  tributeType?: string;
  tributeName?: string;
};

type DonationCreatedEvent = DatabaseEventPayload<ObjectRecordCreateEvent<Donation>>;

const ACKNOWLEDGMENT_DUE_DAYS = 7;

const formatAmount = (amountMicros?: string, currencyCode?: string): string => {
  if (!amountMicros) return 'n/a';
  const value = Number(amountMicros) / 1_000_000;
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode ?? 'USD',
  }).format(value);
  return formatted;
};

const composeTaskTitle = (donation: Donation, donorName: string): string => {
  const amount = formatAmount(donation.amount?.amountMicros, donation.amount?.currencyCode);
  const tribute =
    donation.tributeType && donation.tributeType !== 'NONE'
      ? ` (${donation.tributeType.toLowerCase().replace('_', ' ')}`
        + (donation.tributeName ? ` — ${donation.tributeName}` : '')
        + ')'
      : '';
  return `Acknowledge ${donorName} — ${amount}${tribute}`;
};

const composeTaskBody = (donation: Donation, donorName: string): string => {
  const amount = formatAmount(donation.amount?.amountMicros, donation.amount?.currencyCode);
  const lines = [
    `Donor: ${donorName}`,
    `Donation: ${donation.name}`,
    `Amount: ${amount}`,
    donation.giftDate ? `Gift date: ${donation.giftDate}` : null,
    donation.paymentMethod ? `Payment method: ${donation.paymentMethod}` : null,
    // Structured marker consumed by the mark-acknowledgment-sent logic function.
    // Keep on its own line; do not edit.
    `Donation ID: ${donation.id}`,
  ].filter(Boolean);
  if (donation.tributeType && donation.tributeType !== 'NONE') {
    lines.push(
      `Tribute: ${donation.tributeType.toLowerCase().replace('_', ' ')}`
      + (donation.tributeName ? ` — ${donation.tributeName}` : ''),
    );
  }
  return lines.join('\n');
};

const handler = async (event: DonationCreatedEvent) => {
  const donation = event.properties.after;
  const client = new CoreApiClient();

  // Resolve the hard-credit donor (the Donation Credit with creditType = HARD
  // on this Donation). The donor identity lives on Donation Credit per the
  // NPSP OCR pattern, not on the Donation itself. Raw request: workspace-owned
  // object the generated client rejects; donationId filter form verified
  // against the live workspace.
  const data = await rawQuery({
    donationCredits: {
      __args: {
        filter: { donationId: { eq: donation.id }, creditType: { eq: 'HARD' } },
        first: 1,
      },
      edges: {
        node: {
          id: true,
          person: {
            id: true,
            name: { firstName: true, lastName: true },
            preferredAcknowledgment: true,
            emails: { primaryEmail: true },
          },
        },
      },
    },
  });

  const hardCredit = data.donationCredits?.edges?.[0]?.node;
  const donor = hardCredit?.person;
  const donorName = donor?.name
    ? [donor.name.firstName, donor.name.lastName].filter(Boolean).join(' ')
    : 'Unknown donor';

  const dueAt = new Date(Date.now() + ACKNOWLEDGMENT_DUE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { createTask } = await client.mutation({
    createTask: {
      __args: {
        data: {
          title: composeTaskTitle(donation, donorName),
          bodyV2: { markdown: composeTaskBody(donation, donorName) },
          dueAt,
        },
      },
      id: true,
      title: true,
    },
  });

  if (!createTask) {
    throw new Error('Twenty returned no task after createTask');
  }

  return {
    taskId: createTask.id,
    donationId: donation.id,
    donorId: donor?.id ?? null,
    donorName,
    dueAt,
  };
};

const manualInputSchema: InputJsonSchema = {
  type: 'object',
  properties: {
    donationId: {
      type: 'string',
      label: 'Donation ID',
      description: 'The UUID of the Donation record to generate an acknowledgment for.',
    },
  },
  required: ['donationId'],
};

export default defineLogicFunction({
  universalIdentifier: GENERATE_ACKNOWLEDGMENT_LOGIC_FUNCTION_ID,
  name: 'generate-acknowledgment',
  description:
    'Creates an acknowledgment Task (due in 7 days) for the hard-credit donor of a Donation. ' +
    'Triggered automatically when a Donation is created. Also usable as a workflow action ' +
    'to generate acknowledgments on demand.',
  timeoutSeconds: 10,
  handler,
  databaseEventTriggerSettings: {
    eventName: 'donation.created',
  },
  workflowActionTriggerSettings: {
    label: 'Generate Acknowledgment',
    icon: 'IconMailHeart',
    inputSchema: jsonSchemaToInputSchema(manualInputSchema),
    outputSchema: [
      {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          donationId: { type: 'string' },
          donorId: { type: 'string' },
          donorName: { type: 'string' },
          dueAt: { type: 'string' },
        },
      },
    ],
  },
});
