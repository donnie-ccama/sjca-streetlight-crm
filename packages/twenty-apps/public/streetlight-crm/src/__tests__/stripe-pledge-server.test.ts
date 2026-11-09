import { beforeEach, describe, expect, it, vi } from 'vitest';

type StoredRecord = Record<string, unknown> & { id: string };

const { store, stripeRequestMock, upsertPersonMock, failNextTask } = vi.hoisted(
  () => ({
    failNextTask: { value: false },
    store: {
      pledges: [] as StoredRecord[],
      people: [] as StoredRecord[],
      tasks: [] as StoredRecord[],
      taskTargets: [] as StoredRecord[],
    },
    stripeRequestMock: vi.fn(),
    upsertPersonMock: vi.fn(),
  }),
);

vi.mock('src/logic-functions/stripe-client', () => ({
  stripeRequest: stripeRequestMock,
}));

vi.mock('src/logic-functions/landing-page.server', () => ({
  upsertPerson: upsertPersonMock,
}));

vi.mock('src/logic-functions/online-gift.server', () => ({
  createGiftContext: () => ({}),
  findLandingPageLink: vi.fn(async (slug: string) =>
    slug === 'give' ? { landingPageId: 'page-1' } : null,
  ),
}));

vi.mock('src/logic-functions/workspace-gql', () => {
  const rawQuery = vi.fn(async (selection: Record<string, unknown>) => {
    const rootName = Object.keys(selection)[0] as 'pledges' | 'people';
    const root = selection[rootName] as {
      __args: { filter?: Record<string, { eq: string }>; id?: string };
    };
    const filter = root.__args.filter ?? {};
    const rows = store[rootName].filter((record) =>
      Object.entries(filter).every(([field, { eq }]) => record[field] === eq),
    );

    return { [rootName]: { edges: rows.map((node) => ({ node })) } };
  });

  const collectionByType: Record<string, keyof typeof store> = {
    Pledge: 'pledges',
    Person: 'people',
    Task: 'tasks',
    TaskTarget: 'taskTargets',
  };

  const gql = vi.fn(
    async (query: string, variables: Record<string, unknown> = {}) => {
      const data = variables.data as Record<string, unknown>;
      const create = /create(\w+)\(/.exec(query);

      if (create !== null) {
        if (create[1] === 'Task' && failNextTask.value) {
          failNextTask.value = false;

          throw new Error('task failed');
        }

        const collection = collectionByType[create[1]];
        const id = `${collection}-${store[collection].length + 1}`;

        store[collection].push({ ...data, id });

        return { [`create${create[1]}`]: { id } };
      }

      const update = /update(\w+)\(/.exec(query);

      if (update !== null) {
        Object.assign(
          store[collectionByType[update[1]]].find(
            (record) => record.id === variables.id,
          ) ?? {},
          data,
        );

        return { [`update${update[1]}`]: { id: variables.id } };
      }

      throw new Error(`Unexpected query: ${query}`);
    },
  );

  return { gql, rawQuery, gqlEnum: (value: string) => ({ __gqlEnum: value }) };
});

import { createStaffTask } from 'src/logic-functions/staff-task.server';
import { upsertPledgeFromSubscription } from 'src/logic-functions/stripe-pledge.server';

type Overrides = { status?: string; customer?: Record<string, unknown> };

const stripeReplies = ({ status = 'active', customer }: Overrides = {}) => {
  stripeRequestMock.mockImplementation(async ({ path }: { path: string }) => {
    if (path.startsWith('/v1/subscriptions/')) {
      return {
        id: 'sub_1',
        status,
        customer: 'cus_1',
        start_date: 1793899900,
        canceled_at: null,
        ended_at: status === 'canceled' ? 1793900000 : null,
        metadata: { lp_slug: 'give' },
        items: {
          data: [
            {
              current_period_end: 1796491900,
              price: { unit_amount: 2500, currency: 'usd' },
            },
          ],
        },
      };
    }

    return {
      id: 'cus_1',
      email: 'sam@example.com',
      name: 'Sam Giver',
      phone: null,
      ...customer,
    };
  });
};

beforeEach(() => {
  for (const collection of Object.values(store)) collection.length = 0;

  failNextTask.value = false;
  stripeRequestMock.mockReset();
  upsertPersonMock.mockReset();
  store.people.push({ id: 'person-1', donorType: null });
  upsertPersonMock.mockResolvedValue({
    personId: 'person-1',
    isNewPerson: false,
    smsConsentGranted: false,
  });
  stripeReplies();
});

describe('upsertPledgeFromSubscription', () => {
  it('creates a RECURRING MONTHLY pledge', async () => {
    expect(await upsertPledgeFromSubscription('sub_1')).toEqual({
      pledgeId: 'pledges-1',
      created: true,
    });

    expect(store.pledges).toHaveLength(1);
    expect(store.pledges[0]).toMatchObject({
      stripeSubscriptionId: 'sub_1',
      commitmentType: 'RECURRING',
      frequency: 'MONTHLY',
      status: 'ACTIVE',
      installmentAmount: { amountMicros: '25000000', currencyCode: 'USD' },
      donorPersonId: 'person-1',
      landingPageId: 'page-1',
    });
  });

  it('stores that a plan was made monthly from a one-time gift', async () => {
    await upsertPledgeFromSubscription('sub_1');
    expect(store.pledges[0].madeMonthlyFromOneTime).toBe(false);

    stripeRequestMock.mockImplementation(async ({ path }: { path: string }) =>
      path.startsWith('/v1/subscriptions/')
        ? {
            id: 'sub_1',
            status: 'active',
            customer: 'cus_1',
            start_date: 1793899900,
            canceled_at: null,
            ended_at: null,
            metadata: { lp_slug: 'give', made_monthly_from: 'pi_9' },
            items: { data: [] },
          }
        : { id: 'cus_1', email: 'sam@example.com', name: 'Sam', phone: null },
    );
    await upsertPledgeFromSubscription('sub_1');

    expect(store.pledges[0].madeMonthlyFromOneTime).toBe(true);
  });

  it('updates, not duplicates, on a second call', async () => {
    await upsertPledgeFromSubscription('sub_1');
    stripeReplies({ status: 'past_due' });

    expect(await upsertPledgeFromSubscription('sub_1')).toEqual({
      pledgeId: 'pledges-1',
      created: false,
    });
    expect(store.pledges).toHaveLength(1);
    expect(store.pledges[0].status).toBe('DELINQUENT');
  });

  it('keeps the name, donor, and landing page that staff set when it updates', async () => {
    await upsertPledgeFromSubscription('sub_1');
    Object.assign(store.pledges[0], {
      name: 'Staff name',
      donorPersonId: 'person-staff',
      landingPageId: 'page-staff',
    });
    store.people.push({ id: 'person-2', donorType: null });
    upsertPersonMock.mockResolvedValue({
      personId: 'person-2',
      isNewPerson: true,
      smsConsentGranted: false,
    });
    stripeReplies({ status: 'canceled', customer: { name: 'Other Name' } });

    await upsertPledgeFromSubscription('sub_1');

    expect(store.pledges[0]).toMatchObject({
      name: 'Staff name',
      donorPersonId: 'person-staff',
      landingPageId: 'page-staff',
      status: 'CANCELLED',
      installmentAmount: { amountMicros: '25000000', currencyCode: 'USD' },
      startDate: '2026-11-05',
      nextPaymentDate: null,
      endDate: '2026-11-05',
      madeMonthlyFromOneTime: false,
    });
  });

  it('sets donorType MONTHLY on ACTIVE', async () => {
    await upsertPledgeFromSubscription('sub_1');

    expect(store.people[0].donorType).toBe('MONTHLY');
  });

  it('keeps BOARD', async () => {
    store.people[0].donorType = 'BOARD';

    await upsertPledgeFromSubscription('sub_1');

    expect(store.people[0].donorType).toBe('BOARD');
  });

  it('makes a task on DELINQUENT', async () => {
    await upsertPledgeFromSubscription('sub_1');
    stripeReplies({ status: 'past_due' });
    await upsertPledgeFromSubscription('sub_1');

    expect(store.tasks).toHaveLength(1);
    expect(store.taskTargets[0]).toMatchObject({
      taskId: 'tasks-1',
      targetPersonId: 'person-1',
    });
  });

  it('makes a task on CANCELLED that asks staff to set the donor type', async () => {
    await upsertPledgeFromSubscription('sub_1');
    stripeReplies({ status: 'canceled' });
    await upsertPledgeFromSubscription('sub_1');

    expect(store.tasks).toHaveLength(1);
    expect(JSON.stringify(store.tasks[0])).toContain('donor type');
    expect(store.pledges[0].endDate).toBe('2026-11-05');
  });

  it('makes no second task when the status does not change', async () => {
    await upsertPledgeFromSubscription('sub_1');
    stripeReplies({ status: 'past_due' });
    await upsertPledgeFromSubscription('sub_1');
    await upsertPledgeFromSubscription('sub_1');

    expect(store.tasks).toHaveLength(1);
  });

  it('creates the pledge without a donor when the customer has no email', async () => {
    stripeReplies({ customer: { email: null } });

    await upsertPledgeFromSubscription('sub_1');

    expect(upsertPersonMock).not.toHaveBeenCalled();
    expect(store.pledges[0]).not.toHaveProperty('donorPersonId');
    expect(store.people[0].donorType).toBeNull();
    expect(store.tasks).toHaveLength(0);
  });
});

describe('subscriptions that have not started or changed', () => {
  it.each(['incomplete', 'something_new'])(
    '%s writes nothing',
    async (status) => {
      stripeReplies({ status });

      expect(await upsertPledgeFromSubscription('sub_1')).toBeNull();
      expect(store.pledges).toHaveLength(0);
      expect(store.tasks).toHaveLength(0);
      expect(store.people[0].donorType).toBeNull();
    },
  );

  it('returns the existing pledge for an incomplete status', async () => {
    await upsertPledgeFromSubscription('sub_1');
    stripeReplies({ status: 'incomplete' });

    expect(await upsertPledgeFromSubscription('sub_1')).toEqual({
      pledgeId: 'pledges-1',
      created: false,
    });
    expect(store.pledges[0].status).toBe('ACTIVE');
  });

  it('writes paused as PAUSED without a task or donor type change', async () => {
    store.people[0].donorType = 'ANNUAL';
    stripeReplies({ status: 'paused' });
    await upsertPledgeFromSubscription('sub_1');

    expect(store.pledges[0].status).toBe('PAUSED');
    expect(store.tasks).toHaveLength(0);
    expect(store.people[0].donorType).toBe('ANNUAL');
  });

  it('matches a person when the customer has an email and no name', async () => {
    stripeReplies({ customer: { name: null } });
    await upsertPledgeFromSubscription('sub_1');

    expect(upsertPersonMock).toHaveBeenCalled();
    expect(store.pledges[0].donorPersonId).toBe('person-1');
  });

  it('writes nothing for incomplete_expired with no pledge', async () => {
    stripeReplies({ status: 'incomplete_expired' });

    expect(await upsertPledgeFromSubscription('sub_1')).toBeNull();
    expect(store.pledges).toHaveLength(0);
    expect(store.tasks).toHaveLength(0);
    expect(upsertPersonMock).not.toHaveBeenCalled();
    expect(store.people[0].donorType).toBeNull();
  });

  it('creates a CANCELLED pledge and no task for canceled with no pledge', async () => {
    stripeReplies({ status: 'canceled' });
    await upsertPledgeFromSubscription('sub_1');

    expect(store.pledges).toHaveLength(1);
    expect(store.pledges[0].status).toBe('CANCELLED');
    expect(store.tasks).toHaveLength(0);
  });

  it.each(['ACTIVE', 'PAUSED'])(
    'makes one task on CANCELLED from stored %s',
    async (stored) => {
      store.pledges.push({
        id: 'pledges-1',
        stripeSubscriptionId: 'sub_1',
        status: stored,
      });
      stripeReplies({ status: 'canceled' });
      await upsertPledgeFromSubscription('sub_1');

      expect(store.tasks).toHaveLength(1);
      expect(store.pledges[0].status).toBe('CANCELLED');
    },
  );
});

describe('task failure', () => {
  it('keeps the old status, rejects, and succeeds on retry', async () => {
    await upsertPledgeFromSubscription('sub_1');
    stripeReplies({ status: 'past_due' });
    failNextTask.value = true;

    await expect(upsertPledgeFromSubscription('sub_1')).rejects.toThrow();
    expect(store.pledges[0].status).toBe('ACTIVE');

    await upsertPledgeFromSubscription('sub_1');

    expect(store.tasks).toHaveLength(1);
    expect(store.pledges[0].status).toBe('DELINQUENT');
  });
});

describe('createStaffTask', () => {
  it('creates a task linked to the person', async () => {
    await createStaffTask({ personId: 'person-1', title: 'T', body: 'B' });

    expect(store.tasks[0]).toMatchObject({
      title: 'T',
      bodyV2: { markdown: 'B' },
    });
    expect(store.taskTargets[0]).toMatchObject({
      taskId: 'tasks-1',
      targetPersonId: 'person-1',
    });
  });
});
