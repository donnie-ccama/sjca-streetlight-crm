import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseDeploymentConfiguration } from '../src/deployment-configuration';
import { parseRuntimeEnvironment } from '../src/runtime-environment';

type TenantConfiguration = {
  deployment: ReturnType<typeof parseDeploymentConfiguration>;
  runtimeEnvironment: Record<string, string>;
};

const packageDirectory = join(import.meta.dirname, '..');
const tenantsArgument = process.argv
  .slice(2)
  .find((argument: string) => argument.startsWith('--tenants='));
const tenantSlugs = (tenantsArgument?.slice('--tenants='.length) ?? '')
  .split(',')
  .filter((tenantSlug: string) => tenantSlug.length > 0);

if (tenantSlugs.length < 2) {
  throw new Error('Check at least two deployments with --tenants=sjca,citykid');
}

const tenantConfigurations = tenantSlugs.map((tenantSlug: string) => {
  const tenantDirectory = join(packageDirectory, 'tenants', tenantSlug);
  const deploymentPath = join(tenantDirectory, 'deployment.json');
  const runtimeEnvironmentPath = join(tenantDirectory, 'runtime-env.json');

  if (!existsSync(deploymentPath) || !existsSync(runtimeEnvironmentPath)) {
    throw new Error(`Missing deployment files for ${tenantSlug}`);
  }

  const runtimeEnvironment = parseRuntimeEnvironment(
    readFileSync(runtimeEnvironmentPath, 'utf8'),
  );
  const deployment = parseDeploymentConfiguration(
    readFileSync(deploymentPath, 'utf8'),
    runtimeEnvironment,
  );

  if (deployment.tenantSlug !== tenantSlug) {
    throw new Error(`Deployment tenantSlug does not match ${tenantSlug}`);
  }

  return { deployment, runtimeEnvironment } satisfies TenantConfiguration;
});

const assertUnique = (
  label: string,
  getIdentity: (configuration: TenantConfiguration) => string | undefined,
) => {
  const ownersByIdentity = new Map<string, string>();

  for (const configuration of tenantConfigurations) {
    const identity = getIdentity(configuration);

    if (!identity) {
      continue;
    }

    const existingOwner = ownersByIdentity.get(identity);

    if (existingOwner) {
      throw new Error(
        `${label} is shared by ${existingOwner} and ${configuration.deployment.tenantSlug}`,
      );
    }

    ownersByIdentity.set(identity, configuration.deployment.tenantSlug);
  }
};

const connectionIdentity = (value: string) => {
  const url = new URL(value);

  return `${url.protocol}//${url.host}${url.pathname}`;
};

assertUnique('Cloudflare account', ({ deployment }) => deployment.accountId);
assertUnique('Cloudflare zone', ({ deployment }) => deployment.zoneId);
assertUnique('Hostname', ({ deployment }) => deployment.hostname);
assertUnique('PostgreSQL database', ({ runtimeEnvironment }) =>
  connectionIdentity(runtimeEnvironment.PG_DATABASE_URL),
);
assertUnique('PostgreSQL principal', ({ runtimeEnvironment }) => {
  const databaseUrl = new URL(runtimeEnvironment.PG_DATABASE_URL);

  return `${databaseUrl.host}:${databaseUrl.username}`;
});
assertUnique('Cache Redis', ({ runtimeEnvironment }) =>
  connectionIdentity(runtimeEnvironment.REDIS_URL),
);
assertUnique('Queue Redis', ({ runtimeEnvironment }) =>
  connectionIdentity(runtimeEnvironment.REDIS_QUEUE_URL),
);
assertUnique(
  'R2 bucket',
  ({ runtimeEnvironment }) => runtimeEnvironment.STORAGE_S3_NAME,
);
assertUnique(
  'R2 credential',
  ({ runtimeEnvironment }) => runtimeEnvironment.STORAGE_S3_ACCESS_KEY_ID,
);
assertUnique(
  'Application secret',
  ({ runtimeEnvironment }) => runtimeEnvironment.APP_SECRET,
);
assertUnique(
  'Encryption key',
  ({ runtimeEnvironment }) => runtimeEnvironment.ENCRYPTION_KEY,
);
assertUnique('Lambda role', ({ runtimeEnvironment }) =>
  runtimeEnvironment.LOGIC_FUNCTION_TYPE === 'LAMBDA'
    ? runtimeEnvironment.LOGIC_FUNCTION_LAMBDA_ROLE
    : undefined,
);

console.log(`Tenant isolation check passed for ${tenantSlugs.join(', ')}`);
