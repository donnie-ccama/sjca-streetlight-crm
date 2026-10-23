import assert from 'node:assert/strict';
import test from 'node:test';

import { parseDeploymentConfiguration } from './deployment-configuration';

const createRuntimeEnvironment = (): Record<string, string> => ({
  REDIS_CACHE_PREFIX: 'citykid-streetlight:',
  REDIS_QUEUE_PREFIX: '{citykid-streetlight}',
  SERVER_URL: 'https://crm.citykid.test',
  STORAGE_S3_ENDPOINT: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`,
  STORAGE_S3_NAME: 'citykid-streetlight-crm',
});

const createDeploymentConfiguration = () =>
  JSON.stringify({
    accountId: 'a'.repeat(32),
    hostname: 'crm.citykid.test',
    sourceUrl:
      'https://github.com/example/streetlight-crm/commit/0000000000000000000000000000000000000000',
    tenantSlug: 'citykid',
    zoneId: 'b'.repeat(32),
    zoneName: 'citykid.test',
  });

test('derives an isolated Worker name from the tenant slug', () => {
  assert.deepEqual(
    parseDeploymentConfiguration(
      createDeploymentConfiguration(),
      createRuntimeEnvironment(),
    ),
    {
      accountId: 'a'.repeat(32),
      hostname: 'crm.citykid.test',
      sourceUrl:
        'https://github.com/example/streetlight-crm/commit/0000000000000000000000000000000000000000',
      tenantSlug: 'citykid',
      workerName: 'citykid-streetlight-crm',
      zoneId: 'b'.repeat(32),
      zoneName: 'citykid.test',
    },
  );
});

test('accepts the zone apex as the deployment hostname', () => {
  const deploymentConfiguration = JSON.parse(createDeploymentConfiguration());
  deploymentConfiguration.hostname = 'citykid.test';
  const runtimeEnvironment = createRuntimeEnvironment();
  runtimeEnvironment.SERVER_URL = 'https://citykid.test';

  assert.equal(
    parseDeploymentConfiguration(
      JSON.stringify(deploymentConfiguration),
      runtimeEnvironment,
    ).hostname,
    'citykid.test',
  );
});

test('rejects a hostname that differs from the runtime origin', () => {
  const runtimeEnvironment = createRuntimeEnvironment();
  runtimeEnvironment.SERVER_URL = 'https://crm.sjca.test';

  assert.throws(
    () =>
      parseDeploymentConfiguration(
        createDeploymentConfiguration(),
        runtimeEnvironment,
      ),
    /hostname must match/,
  );
});

test('rejects a shared R2 bucket name', () => {
  const runtimeEnvironment = createRuntimeEnvironment();
  runtimeEnvironment.STORAGE_S3_NAME = 'shared-streetlight-crm';

  assert.throws(
    () =>
      parseDeploymentConfiguration(
        createDeploymentConfiguration(),
        runtimeEnvironment,
      ),
    /STORAGE_S3_NAME must be citykid-streetlight-crm/,
  );
});

test('rejects a cache prefix from another tenant', () => {
  const runtimeEnvironment = createRuntimeEnvironment();
  runtimeEnvironment.REDIS_CACHE_PREFIX = 'sjca-streetlight:';

  assert.throws(
    () =>
      parseDeploymentConfiguration(
        createDeploymentConfiguration(),
        runtimeEnvironment,
      ),
    /REDIS_CACHE_PREFIX must be citykid-streetlight:/,
  );
});

test('rejects a queue prefix from another tenant', () => {
  const runtimeEnvironment = createRuntimeEnvironment();
  runtimeEnvironment.REDIS_QUEUE_PREFIX = '{streetlight-streetlight}';

  assert.throws(
    () =>
      parseDeploymentConfiguration(
        createDeploymentConfiguration(),
        runtimeEnvironment,
      ),
    /REDIS_QUEUE_PREFIX must be \{citykid-streetlight\}/,
  );
});

test('rejects a tenant slug that is unsafe in resource names', () => {
  const deploymentConfiguration = JSON.parse(createDeploymentConfiguration());
  deploymentConfiguration.tenantSlug = '../citykid';

  assert.throws(
    () =>
      parseDeploymentConfiguration(
        JSON.stringify(deploymentConfiguration),
        createRuntimeEnvironment(),
      ),
    /tenantSlug must be a lowercase DNS label/,
  );
});

test('rejects malformed Cloudflare account and zone identifiers', () => {
  const deploymentConfiguration = JSON.parse(createDeploymentConfiguration());
  deploymentConfiguration.accountId = 'not-an-account-id';

  assert.throws(
    () =>
      parseDeploymentConfiguration(
        JSON.stringify(deploymentConfiguration),
        createRuntimeEnvironment(),
      ),
    /accountId and zoneId must be non-placeholder Cloudflare identifiers/,
  );
});

test('rejects placeholder Cloudflare identifiers', () => {
  const deploymentConfiguration = JSON.parse(createDeploymentConfiguration());
  deploymentConfiguration.zoneId = '0'.repeat(32);

  assert.throws(
    () =>
      parseDeploymentConfiguration(
        JSON.stringify(deploymentConfiguration),
        createRuntimeEnvironment(),
      ),
    /non-placeholder Cloudflare identifiers/,
  );
});

test('rejects an R2 endpoint from another Cloudflare account', () => {
  const runtimeEnvironment = createRuntimeEnvironment();
  runtimeEnvironment.STORAGE_S3_ENDPOINT = `https://${'c'.repeat(32)}.r2.cloudflarestorage.com`;

  assert.throws(
    () =>
      parseDeploymentConfiguration(
        createDeploymentConfiguration(),
        runtimeEnvironment,
      ),
    /STORAGE_S3_ENDPOINT must belong to the deployment account/,
  );
});

test('rejects a hostname outside the pinned Cloudflare zone', () => {
  const deploymentConfiguration = JSON.parse(createDeploymentConfiguration());
  deploymentConfiguration.zoneName = 'sjca.test';

  assert.throws(
    () =>
      parseDeploymentConfiguration(
        JSON.stringify(deploymentConfiguration),
        createRuntimeEnvironment(),
      ),
    /hostname must be the lowercase zoneName or one of its subdomains/,
  );
});
