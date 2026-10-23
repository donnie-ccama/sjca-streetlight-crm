import assert from 'node:assert/strict';
import test from 'node:test';

import { preflightCloudflareTarget } from './cloudflare-preflight';
import type { DeploymentConfiguration } from './deployment-configuration';

const deployment: DeploymentConfiguration = {
  accountId: 'a'.repeat(32),
  hostname: 'crm.sjca.test',
  sourceUrl:
    'https://github.com/example/streetlight-crm/commit/0000000000000000000000000000000000000000',
  tenantSlug: 'sjca',
  workerName: 'sjca-streetlight-crm',
  zoneId: 'b'.repeat(32),
  zoneName: 'sjca.test',
};

const response = (result: unknown) =>
  new Response(JSON.stringify({ result, success: true }), { status: 200 });

const createFetcher =
  (
    zone: Record<string, unknown>,
    workerDomains: Array<Record<string, unknown>> = [],
    dnsRecords: Array<Record<string, unknown>> = [],
  ) =>
  async (input: string): Promise<Response> => {
    if (input.includes('/workers/domains?')) {
      return response(workerDomains);
    }

    if (input.includes('/dns_records?')) {
      return response(dnsRecords);
    }

    return response(zone);
  };

const validZone = {
  account: { id: deployment.accountId },
  id: deployment.zoneId,
  name: deployment.zoneName,
  status: 'active',
};

test('accepts an active zone and unused hostname', async () => {
  await preflightCloudflareTarget(
    deployment,
    'test-token',
    createFetcher(validZone),
  );
});

test('rejects a zone from another account', async () => {
  await assert.rejects(
    preflightCloudflareTarget(
      deployment,
      'test-token',
      createFetcher({
        ...validZone,
        account: { id: 'c'.repeat(32) },
      }),
    ),
    /zone does not match/,
  );
});

test('rejects an existing DNS record without a matching Worker domain', async () => {
  await assert.rejects(
    preflightCloudflareTarget(
      deployment,
      'test-token',
      createFetcher(
        validZone,
        [],
        [{ id: 'record-id', name: deployment.hostname, type: 'CNAME' }],
      ),
    ),
    /conflicting DNS record/,
  );
});

test('allows the hostname already assigned to the same Worker', async () => {
  let requestedDnsRecords = false;

  await preflightCloudflareTarget(
    deployment,
    'test-token',
    async (input) => {
      if (input.includes('/workers/domains?')) {
        return response([
          {
            hostname: deployment.hostname,
            service: deployment.workerName,
            zone_id: deployment.zoneId,
            zone_name: deployment.zoneName,
          },
        ]);
      }

      if (input.includes('/dns_records?')) {
        requestedDnsRecords = true;
      }

      return response(validZone);
    },
  );

  assert.equal(requestedDnsRecords, false);
});

test('rejects a hostname assigned to another Worker', async () => {
  await assert.rejects(
    preflightCloudflareTarget(
      deployment,
      'test-token',
      createFetcher(validZone, [
        {
          hostname: deployment.hostname,
          service: 'another-worker',
          zone_id: deployment.zoneId,
          zone_name: deployment.zoneName,
        },
      ]),
    ),
    /different Worker or zone/,
  );
});
