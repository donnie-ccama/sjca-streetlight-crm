const REQUIRED_RUNTIME_KEYS = [
  'APP_SECRET',
  'EMAIL_DRIVER',
  'EMAIL_FROM_ADDRESS',
  'EMAIL_FROM_NAME',
  'EMAIL_SMTP_HOST',
  'EMAIL_SMTP_PASSWORD',
  'EMAIL_SMTP_PORT',
  'EMAIL_SMTP_USER',
  'ENCRYPTION_KEY',
  'FRONTEND_URL',
  'LOGIC_FUNCTION_TYPE',
  'NODE_ENV',
  'PG_DATABASE_URL',
  'REDIS_CACHE_PREFIX',
  'REDIS_QUEUE_PREFIX',
  'REDIS_QUEUE_URL',
  'REDIS_URL',
  'SERVER_URL',
  'STORAGE_S3_ACCESS_KEY_ID',
  'STORAGE_S3_ENDPOINT',
  'STORAGE_S3_NAME',
  'STORAGE_S3_REGION',
  'STORAGE_S3_SECRET_ACCESS_KEY',
  'STORAGE_TYPE',
] as const;

const REQUIRED_LAMBDA_KEYS = [
  'LOGIC_FUNCTION_LAMBDA_ACCESS_KEY_ID',
  'LOGIC_FUNCTION_LAMBDA_LAYER_BUCKET',
  'LOGIC_FUNCTION_LAMBDA_LAYER_BUCKET_REGION',
  'LOGIC_FUNCTION_LAMBDA_REGION',
  'LOGIC_FUNCTION_LAMBDA_ROLE',
  'LOGIC_FUNCTION_LAMBDA_SECRET_ACCESS_KEY',
] as const;

const PLACEHOLDER_PATTERN = /replace-me|replace-with|example\.org|ACCOUNT_ID/;

export const parseRuntimeEnvironment = (
  encodedEnvironment: string,
): Record<string, string> => {
  let parsedEnvironment: unknown;

  try {
    parsedEnvironment = JSON.parse(encodedEnvironment);
  } catch (error) {
    throw new Error('STREETLIGHT_RUNTIME_ENV_JSON must contain valid JSON', {
      cause: error,
    });
  }

  if (
    parsedEnvironment === null ||
    typeof parsedEnvironment !== 'object' ||
    Array.isArray(parsedEnvironment)
  ) {
    throw new Error('STREETLIGHT_RUNTIME_ENV_JSON must be a JSON object');
  }

  const environmentEntries = Object.entries(parsedEnvironment);
  const invalidEntry = environmentEntries.find(
    ([key, value]) =>
      key.length === 0 || typeof value !== 'string' || value.length === 0,
  );

  if (invalidEntry) {
    throw new Error(
      `Runtime environment value for ${invalidEntry[0] || '<empty key>'} must be a non-empty string`,
    );
  }

  const environment = Object.fromEntries(environmentEntries) as Record<
    string,
    string
  >;
  const missingKeys = REQUIRED_RUNTIME_KEYS.filter(
    (key) => environment[key] === undefined,
  );

  if (missingKeys.length > 0) {
    throw new Error(
      `Runtime environment is missing required keys: ${missingKeys.join(', ')}`,
    );
  }

  const placeholderKey = environmentEntries.find(([, value]) =>
    PLACEHOLDER_PATTERN.test(value as string),
  )?.[0];

  if (placeholderKey) {
    throw new Error(
      `Runtime environment still has a placeholder for ${placeholderKey}`,
    );
  }

  if (environment.NODE_ENV !== 'production') {
    throw new Error('NODE_ENV must be production');
  }

  if (environment.SERVER_URL !== environment.FRONTEND_URL) {
    throw new Error('SERVER_URL and FRONTEND_URL must match');
  }

  const serverUrl = new URL(environment.SERVER_URL);

  if (
    serverUrl.protocol !== 'https:' ||
    serverUrl.username.length > 0 ||
    serverUrl.password.length > 0 ||
    serverUrl.port.length > 0 ||
    serverUrl.pathname !== '/' ||
    serverUrl.search.length > 0 ||
    serverUrl.hash.length > 0
  ) {
    throw new Error('SERVER_URL must be an HTTPS origin without a path');
  }

  const postgresUrl = new URL(environment.PG_DATABASE_URL);

  if (!['postgres:', 'postgresql:'].includes(postgresUrl.protocol)) {
    throw new Error('PG_DATABASE_URL must use PostgreSQL');
  }

  const sslModes = postgresUrl.searchParams.getAll('sslmode');

  if (
    sslModes.length !== 1 ||
    !['require', 'verify-ca', 'verify-full'].includes(sslModes[0])
  ) {
    throw new Error('PG_DATABASE_URL must have one TLS-enforcing sslmode');
  }

  if (!environment.REDIS_URL.startsWith('rediss://')) {
    throw new Error('REDIS_URL must use TLS');
  }

  if (!environment.REDIS_QUEUE_URL.startsWith('rediss://')) {
    throw new Error('REDIS_QUEUE_URL must use TLS');
  }

  if (environment.REDIS_QUEUE_URL === environment.REDIS_URL) {
    throw new Error('REDIS_QUEUE_URL must use a dedicated queue endpoint');
  }

  if (!/^\{[a-z0-9-]+\}$/.test(environment.REDIS_QUEUE_PREFIX)) {
    throw new Error('REDIS_QUEUE_PREFIX must be a Redis hash tag');
  }

  if (environment.LOGIC_FUNCTION_TYPE === 'LOCAL') {
    throw new Error(
      'LOCAL logic functions inherit production secrets; use LAMBDA or DISABLED',
    );
  }

  if (!['DISABLED', 'LAMBDA'].includes(environment.LOGIC_FUNCTION_TYPE)) {
    throw new Error('LOGIC_FUNCTION_TYPE must be LAMBDA or DISABLED');
  }

  if (environment.LOGIC_FUNCTION_TYPE === 'LAMBDA') {
    const missingLambdaKeys = REQUIRED_LAMBDA_KEYS.filter(
      (key) => environment[key] === undefined,
    );

    if (missingLambdaKeys.length > 0) {
      throw new Error(
        `LAMBDA logic functions are missing required keys: ${missingLambdaKeys.join(', ')}`,
      );
    }
  }

  if (environment.APP_SECRET.length < 32) {
    throw new Error('APP_SECRET must contain at least 32 characters');
  }

  if (!/^[0-9a-f]{64}$/.test(environment.ENCRYPTION_KEY)) {
    throw new Error('ENCRYPTION_KEY must be a 32-byte lowercase hex value');
  }

  if (environment.STORAGE_TYPE !== 's3') {
    throw new Error('STORAGE_TYPE must be s3');
  }

  if (environment.EMAIL_DRIVER !== 'SMTP') {
    throw new Error('EMAIL_DRIVER must be SMTP');
  }

  if (
    !/^https:\/\/[a-z0-9]+\.r2\.cloudflarestorage\.com$/.test(
      environment.STORAGE_S3_ENDPOINT,
    )
  ) {
    throw new Error('STORAGE_S3_ENDPOINT must be a Cloudflare R2 endpoint');
  }

  const reservedKey = environmentEntries.find(([key]) =>
    key.startsWith('CLOUDFLARE_'),
  )?.[0];

  if (reservedKey) {
    throw new Error(
      `Runtime environment cannot set reserved key ${reservedKey}`,
    );
  }

  return environment;
};
