import assert from 'node:assert/strict';
import test from 'node:test';

import { parseRuntimeEnvironment } from './runtime-environment';

const createValidEnvironment = (): Record<string, string> => ({
  APP_SECRET: 'a'.repeat(32),
  EMAIL_DRIVER: 'SMTP',
  EMAIL_FROM_ADDRESS: 'crm@citykid.test',
  EMAIL_FROM_NAME: 'Streetlight CRM',
  EMAIL_SMTP_HOST: 'smtp.citykid.test',
  EMAIL_SMTP_PASSWORD: 'smtp-password',
  EMAIL_SMTP_PORT: '465',
  EMAIL_SMTP_USER: 'smtp-user',
  ENCRYPTION_KEY: 'b'.repeat(64),
  FRONTEND_URL: 'https://crm.citykid.test',
  LOGIC_FUNCTION_TYPE: 'DISABLED',
  NODE_ENV: 'production',
  PG_DATABASE_URL:
    'postgres://streetlight:secret@postgres.citykid.test:5432/streetlight?sslmode=require',
  REDIS_CACHE_PREFIX: 'citykid-streetlight:',
  REDIS_QUEUE_PREFIX: '{citykid-streetlight}',
  REDIS_QUEUE_URL: 'rediss://default:secret@redis-queue.citykid.test:6379',
  REDIS_URL: 'rediss://default:secret@redis-cache.citykid.test:6379',
  SERVER_URL: 'https://crm.citykid.test',
  STORAGE_S3_ACCESS_KEY_ID: 'access-key',
  STORAGE_S3_ENDPOINT: 'https://0123456789abcdef.r2.cloudflarestorage.com',
  STORAGE_S3_NAME: 'citykid-streetlight-crm',
  STORAGE_S3_REGION: 'auto',
  STORAGE_S3_SECRET_ACCESS_KEY: 'secret-key',
  STORAGE_TYPE: 's3',
});

test('accepts a complete production environment', () => {
  const environment = createValidEnvironment();

  assert.deepEqual(
    parseRuntimeEnvironment(JSON.stringify(environment)),
    environment,
  );
});

test('rejects a non-TLS Redis connection', () => {
  const environment = createValidEnvironment();
  environment.REDIS_URL = 'redis://redis.citykid.test:6379';

  assert.throws(
    () => parseRuntimeEnvironment(JSON.stringify(environment)),
    /REDIS_URL must use TLS/,
  );
});

test('rejects a PostgreSQL URL that overrides its TLS mode', () => {
  const environment = createValidEnvironment();
  environment.PG_DATABASE_URL += '&sslmode=disable';

  assert.throws(
    () => parseRuntimeEnvironment(JSON.stringify(environment)),
    /one TLS-enforcing sslmode/,
  );
});

test('rejects a shared cache and queue Redis endpoint', () => {
  const environment = createValidEnvironment();
  environment.REDIS_QUEUE_URL = environment.REDIS_URL;

  assert.throws(
    () => parseRuntimeEnvironment(JSON.stringify(environment)),
    /dedicated queue endpoint/,
  );
});

test('rejects unsandboxed local logic functions', () => {
  const environment = createValidEnvironment();
  environment.LOGIC_FUNCTION_TYPE = 'LOCAL';

  assert.throws(
    () => parseRuntimeEnvironment(JSON.stringify(environment)),
    /LOCAL logic functions inherit production secrets/,
  );
});

test('rejects incomplete Lambda isolation configuration', () => {
  const environment = createValidEnvironment();
  environment.LOGIC_FUNCTION_TYPE = 'LAMBDA';

  assert.throws(
    () => parseRuntimeEnvironment(JSON.stringify(environment)),
    /LAMBDA logic functions are missing required keys/,
  );
});

test('rejects unresolved example values', () => {
  const environment = createValidEnvironment();
  environment.STORAGE_S3_ACCESS_KEY_ID = 'replace-me';

  assert.throws(
    () => parseRuntimeEnvironment(JSON.stringify(environment)),
    /placeholder for STORAGE_S3_ACCESS_KEY_ID/,
  );
});

test('rejects reserved Cloudflare runtime keys', () => {
  const environment = createValidEnvironment();
  environment.CLOUDFLARE_REGION = 'WNAM';

  assert.throws(
    () => parseRuntimeEnvironment(JSON.stringify(environment)),
    /reserved key CLOUDFLARE_REGION/,
  );
});
