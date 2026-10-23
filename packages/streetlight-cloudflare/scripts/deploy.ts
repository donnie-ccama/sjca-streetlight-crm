import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parse } from 'jsonc-parser';

import { preflightCloudflareTarget } from '../src/cloudflare-preflight';
import { parseDeploymentConfiguration } from '../src/deployment-configuration';
import { parseRuntimeEnvironment } from '../src/runtime-environment';

type WranglerConfiguration = {
  account_id?: string;
  containers: Array<{
    images: {
      streetlight: {
        build_vars: Record<string, string>;
      };
    };
  }>;
  routes?: Array<{ custom_domain: true; pattern: string }>;
  name: string;
  vars: {
    STREETLIGHT_SOURCE_REVISION: string;
    STREETLIGHT_SOURCE_URL: string;
    STREETLIGHT_TENANT_SLUG: string;
  };
  workers_dev: boolean;
};

const packageDirectory = join(import.meta.dirname, '..');
const repositoryDirectory = join(packageDirectory, '..', '..');
const repositoryVersion = (
  JSON.parse(
    readFileSync(join(repositoryDirectory, 'package.json'), 'utf8'),
  ) as { version: string }
).version;
const arguments_ = process.argv.slice(2);
const dryRun = arguments_.includes('--dry-run');
const tenantArgument = arguments_.find((argument: string) =>
  argument.startsWith('--tenant='),
);
const tenantSlug = tenantArgument?.slice('--tenant='.length);
const unsupportedArgument = arguments_.find(
  (argument: string) => argument !== '--dry-run' && argument !== tenantArgument,
);

if (unsupportedArgument) {
  throw new Error(`Unsupported deploy argument: ${unsupportedArgument}`);
}

if (!tenantSlug || !/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(tenantSlug)) {
  throw new Error('Deploy with --tenant=<lowercase-tenant-slug>');
}

const tenantDirectory = join(packageDirectory, 'tenants', tenantSlug);
const runtimeEnvironmentPath = join(tenantDirectory, 'runtime-env.json');
const deploymentConfigurationPath = join(tenantDirectory, 'deployment.json');
const wranglerConfigurationPath = join(packageDirectory, 'wrangler.jsonc');

if (!existsSync(runtimeEnvironmentPath)) {
  throw new Error(
    `Copy tenants/${tenantSlug}/runtime-env.example.json to runtime-env.json first`,
  );
}

if (!existsSync(deploymentConfigurationPath)) {
  throw new Error(
    `Copy tenants/${tenantSlug}/deployment.example.json to deployment.json first`,
  );
}

const encodedEnvironment = readFileSync(runtimeEnvironmentPath, 'utf8');
const runtimeEnvironment = parseRuntimeEnvironment(encodedEnvironment);
const deploymentConfiguration = parseDeploymentConfiguration(
  readFileSync(deploymentConfigurationPath, 'utf8'),
  runtimeEnvironment,
);

if (deploymentConfiguration.tenantSlug !== tenantSlug) {
  throw new Error('Deployment tenantSlug must match the --tenant argument');
}

const { accountId, hostname, sourceUrl, workerName } = deploymentConfiguration;

if (!dryRun) {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!apiToken) {
    throw new Error(
      'CLOUDFLARE_API_TOKEN is required for the live account and zone preflight',
    );
  }

  await preflightCloudflareTarget(deploymentConfiguration, apiToken);
}

const sourceRevision = new URL(sourceUrl).pathname.match(
  /\/([0-9a-f]{40})$/,
)?.[1];

if (!sourceUrl.startsWith('https://') || !sourceRevision) {
  throw new Error(
    'sourceUrl must be an HTTPS URL pinned to a 40-character SHA',
  );
}

const runGit = (arguments_: string[]): string => {
  const result = spawnSync('git', arguments_, {
    cwd: repositoryDirectory,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(`Git preflight failed: ${result.stderr.trim()}`);
  }

  return result.stdout.trim();
};

const headRevision = runGit(['rev-parse', 'HEAD']);
const originUrl = runGit(['config', '--get', 'remote.origin.url']);
const publicOriginUrl = originUrl
  .replace(/^git@([^:]+):/, 'https://$1/')
  .replace(/\.git$/, '');
const expectedSourceUrl = `${publicOriginUrl}/commit/${headRevision}`;

if (sourceRevision !== headRevision || sourceUrl !== expectedSourceUrl) {
  throw new Error('sourceUrl must identify the current origin HEAD commit');
}

if (runGit(['status', '--porcelain', '--untracked-files=all']).length > 0) {
  throw new Error('Deployment requires a clean Git worktree');
}

const sourceResponse = await fetch(sourceUrl, {
  method: 'HEAD',
  redirect: 'follow',
});
await sourceResponse.body?.cancel();

if (!sourceResponse.ok) {
  throw new Error(
    `sourceUrl must be publicly accessible; received ${sourceResponse.status}`,
  );
}

const wranglerConfiguration = parse(
  readFileSync(wranglerConfigurationPath, 'utf8'),
) as WranglerConfiguration;
const imageBuildVariables =
  wranglerConfiguration.containers[0]?.images.streetlight.build_vars;

if (!imageBuildVariables) {
  throw new Error('Wrangler configuration is missing the Streetlight image');
}

wranglerConfiguration.workers_dev = false;
wranglerConfiguration.account_id = accountId;
wranglerConfiguration.name = workerName;
wranglerConfiguration.routes = [{ custom_domain: true, pattern: hostname }];
wranglerConfiguration.vars.STREETLIGHT_SOURCE_REVISION = sourceRevision;
wranglerConfiguration.vars.STREETLIGHT_SOURCE_URL = sourceUrl;
wranglerConfiguration.vars.STREETLIGHT_TENANT_SLUG = tenantSlug;
imageBuildVariables.APP_VERSION = repositoryVersion;
imageBuildVariables.SOURCE_REVISION = sourceRevision;
imageBuildVariables.SOURCE_URL = sourceUrl;

const temporaryDirectory = mkdtempSync(
  join(tmpdir(), 'streetlight-cloudflare-'),
);
const secretsFilePath = join(temporaryDirectory, 'secrets.json');
const deployConfigurationPath = join(
  packageDirectory,
  `wrangler.deploy-${process.pid}.json`,
);

try {
  writeFileSync(
    secretsFilePath,
    JSON.stringify({ STREETLIGHT_RUNTIME_ENV_JSON: encodedEnvironment }),
    { mode: 0o600 },
  );
  writeFileSync(
    deployConfigurationPath,
    JSON.stringify(wranglerConfiguration),
    { mode: 0o600 },
  );

  const result = spawnSync(
    'wrangler',
    [
      'deploy',
      ...(dryRun ? ['--dry-run', '--containers-rollout', 'none'] : []),
      '--config',
      deployConfigurationPath,
      '--secrets-file',
      secretsFilePath,
    ],
    { stdio: 'inherit' },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
} finally {
  rmSync(deployConfigurationPath, { force: true });
  rmSync(temporaryDirectory, { force: true, recursive: true });
}
