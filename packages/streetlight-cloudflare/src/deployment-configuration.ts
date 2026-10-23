export type DeploymentConfiguration = {
  accountId: string;
  hostname: string;
  sourceUrl: string;
  tenantSlug: string;
  workerName: string;
  zoneId: string;
  zoneName: string;
};

const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const CLOUDFLARE_IDENTIFIER_PATTERN = /^[0-9a-f]{32}$/;
const EMPTY_CLOUDFLARE_IDENTIFIER = '0'.repeat(32);

export const parseDeploymentConfiguration = (
  encodedConfiguration: string,
  runtimeEnvironment: Record<string, string>,
): DeploymentConfiguration => {
  let parsedConfiguration: unknown;

  try {
    parsedConfiguration = JSON.parse(encodedConfiguration);
  } catch (error) {
    throw new Error('deployment.json must contain valid JSON', {
      cause: error,
    });
  }

  if (
    parsedConfiguration === null ||
    typeof parsedConfiguration !== 'object' ||
    Array.isArray(parsedConfiguration)
  ) {
    throw new Error('deployment.json must be a JSON object');
  }

  const configuration = parsedConfiguration as Record<string, unknown>;

  if (
    typeof configuration.accountId !== 'string' ||
    typeof configuration.hostname !== 'string' ||
    typeof configuration.sourceUrl !== 'string' ||
    typeof configuration.tenantSlug !== 'string' ||
    typeof configuration.zoneId !== 'string' ||
    typeof configuration.zoneName !== 'string'
  ) {
    throw new Error(
      'deployment.json requires accountId, hostname, sourceUrl, tenantSlug, zoneId, and zoneName strings',
    );
  }

  const { accountId, hostname, sourceUrl, tenantSlug, zoneId, zoneName } =
    configuration as {
      accountId: string;
      hostname: string;
      sourceUrl: string;
      tenantSlug: string;
      zoneId: string;
      zoneName: string;
    };

  if (
    !CLOUDFLARE_IDENTIFIER_PATTERN.test(accountId) ||
    !CLOUDFLARE_IDENTIFIER_PATTERN.test(zoneId) ||
    accountId === EMPTY_CLOUDFLARE_IDENTIFIER ||
    zoneId === EMPTY_CLOUDFLARE_IDENTIFIER
  ) {
    throw new Error(
      'accountId and zoneId must be non-placeholder Cloudflare identifiers',
    );
  }

  if (
    zoneName !== zoneName.toLowerCase() ||
    (hostname !== zoneName && !hostname.endsWith(`.${zoneName}`))
  ) {
    throw new Error(
      'hostname must be the lowercase zoneName or one of its subdomains',
    );
  }

  if (!TENANT_SLUG_PATTERN.test(tenantSlug)) {
    throw new Error(
      'tenantSlug must be a lowercase DNS label with at most 32 characters',
    );
  }

  let deploymentOrigin: URL;

  try {
    deploymentOrigin = new URL(`https://${hostname}`);
  } catch (error) {
    throw new Error('hostname must be a valid DNS hostname', { cause: error });
  }

  if (
    deploymentOrigin.hostname !== hostname ||
    deploymentOrigin.port.length > 0 ||
    deploymentOrigin.pathname !== '/'
  ) {
    throw new Error('hostname must be a lowercase DNS hostname without a path');
  }

  if (
    deploymentOrigin.origin !== new URL(runtimeEnvironment.SERVER_URL).origin
  ) {
    throw new Error('deployment hostname must match the runtime SERVER_URL');
  }

  const expectedResourceName = `${tenantSlug}-streetlight-crm`;
  const storageEndpoint = new URL(runtimeEnvironment.STORAGE_S3_ENDPOINT);

  if (storageEndpoint.hostname !== `${accountId}.r2.cloudflarestorage.com`) {
    throw new Error(
      'STORAGE_S3_ENDPOINT must belong to the deployment account',
    );
  }

  if (runtimeEnvironment.STORAGE_S3_NAME !== expectedResourceName) {
    throw new Error(
      `STORAGE_S3_NAME must be ${expectedResourceName} for tenant isolation`,
    );
  }

  if (runtimeEnvironment.REDIS_CACHE_PREFIX !== `${tenantSlug}-streetlight:`) {
    throw new Error(
      `REDIS_CACHE_PREFIX must be ${tenantSlug}-streetlight: for tenant isolation`,
    );
  }

  if (runtimeEnvironment.REDIS_QUEUE_PREFIX !== `{${tenantSlug}-streetlight}`) {
    throw new Error(
      `REDIS_QUEUE_PREFIX must be {${tenantSlug}-streetlight} for tenant isolation`,
    );
  }

  return {
    accountId,
    hostname,
    sourceUrl,
    tenantSlug,
    workerName: expectedResourceName,
    zoneId,
    zoneName,
  };
};
