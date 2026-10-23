import { defineLogicFunction } from 'twenty-sdk/define';
import type { DatabaseEventPayload, ObjectRecordUpdateEvent } from 'twenty-sdk/logic-function';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { isDefined } from 'twenty-sdk/utils';

import {
  DONATION_ID_MARKER_PREFIX,
  MARK_ACKNOWLEDGMENT_SENT_LOGIC_FUNCTION_ID,
} from 'src/constants/donor-identifiers';
import { rawMutation } from 'src/logic-functions/workspace-gql';

type Task = {
  id: string;
  title: string;
  status?: string;
  bodyV2?: { markdown?: string };
};

type TaskUpdatedEvent = DatabaseEventPayload<ObjectRecordUpdateEvent<Task>>;

const UUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

const extractDonationId = (markdown?: string): string | null => {
  if (!markdown) return null;
  for (const line of markdown.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith(DONATION_ID_MARKER_PREFIX)) {
      const rest = trimmed.slice(DONATION_ID_MARKER_PREFIX.length).trim();
      const match = rest.match(UUID_RE);
      if (match) return match[0];
    }
  }
  return null;
};

// Only run when status actually changed to DONE. Other task edits (title,
// assignee, due date, body edits) must not re-fire the acknowledgment update.
const isCompletionTransition = (event: TaskUpdatedEvent): boolean => {
  const { before, after, updatedFields } = event.properties;
  if (!updatedFields?.includes('status')) return false;
  return before?.status !== 'DONE' && after?.status === 'DONE';
};

const handler = async (event: TaskUpdatedEvent) => {
  if (!isCompletionTransition(event)) {
    return { skipped: true, reason: 'not a completion transition' };
  }

  const task = event.properties.after;
  const client = new CoreApiClient();

  // The body in the event payload may be stale or missing rich-text content;
  // re-fetch the task to read the canonical bodyV2.markdown.
  const { task: fresh } = await client.query({
    task: {
      __args: { filter: { id: { eq: task.id } } },
      id: true,
      title: true,
      status: true,
      bodyV2: { markdown: true },
    },
  });

  if (!isDefined(fresh)) {
    return { skipped: true, reason: 'task not found', taskId: task.id };
  }

  const donationId = extractDonationId(fresh.bodyV2?.markdown);
  if (!donationId) {
    return {
      skipped: true,
      reason: 'no Donation ID marker in task body',
      taskId: task.id,
    };
  }

  // Raw mutation: donations are workspace-owned and the generated client
  // rejects updateDonations at runtime (verified in production).
  const data = await rawMutation({
    updateDonations: {
      __args: {
        data: { acknowledgmentStatus: 'SENT' },
        filter: { id: { eq: donationId } },
      },
      id: true,
      acknowledgmentStatus: true,
    },
  });

  const updated = data.updateDonations?.[0];
  return {
    taskId: task.id,
    donationId,
    acknowledgmentStatus: updated?.acknowledgmentStatus ?? null,
    acknowledgedAt: new Date().toISOString(),
  };
};

export default defineLogicFunction({
  universalIdentifier: MARK_ACKNOWLEDGMENT_SENT_LOGIC_FUNCTION_ID,
  name: 'mark-acknowledgment-sent',
  description:
    'When an acknowledgment Task is marked Done, flips the linked Donation.acknowledgmentStatus ' +
    'to SENT. Links the Donation back to the Task via the "Donation ID:" marker embedded in the ' +
    'Task body by generate-acknowledgment.',
  timeoutSeconds: 10,
  handler,
  databaseEventTriggerSettings: {
    eventName: 'task.updated',
    updatedFields: ['status'],
  },
});
