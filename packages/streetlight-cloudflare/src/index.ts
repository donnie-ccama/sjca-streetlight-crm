import { DurableObject } from 'cloudflare:workers';

import { parseRuntimeEnvironment } from './runtime-environment';

type ContainerRole = 'server' | 'worker';

const INSTANCE_TYPE_BY_ROLE = {
  server: 'standard-1',
  worker: 'standard-1',
} as const;
const SERVER_PORT = 3000;
const READY_ATTEMPTS = 120;
const READY_RETRY_DELAY_MS = 2_000;
const WORKER_STARTUP_GRACE_PERIOD_MS = 5_000;
const CONTAINER_INACTIVITY_TIMEOUT_MS = 6 * 60 * 60 * 1_000;
const CONFIGURATION_FINGERPRINT_LENGTH = 32;
const CONTAINER_STARTUP_POLICY_VERSION = '1';

const createConfigurationFingerprint = async (
  encodedEnvironment: string,
  role: ContainerRole,
  tenantSlug: string,
): Promise<string> => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(
      [
        CONTAINER_STARTUP_POLICY_VERSION,
        tenantSlug,
        role,
        encodedEnvironment,
      ].join('\0'),
    ),
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, CONFIGURATION_FINGERPRINT_LENGTH);
};

export class StreetlightContainer extends DurableObject<CloudflareEnv> {
  private starting: Promise<void> | undefined;
  private monitoring: Promise<void> | undefined;

  constructor(context: DurableObjectState, environment: CloudflareEnv) {
    super(context, environment);

    const container = context.container;

    if (container?.running) {
      void context.blockConcurrencyWhile(() =>
        container.setInactivityTimeout(CONTAINER_INACTIVITY_TIMEOUT_MS),
      );
    }
  }

  async fetch(request: Request): Promise<Response> {
    await this.ensureRunning('server');

    const url = new URL(request.url);
    url.protocol = 'http:';
    url.host = 'container';
    const forwardedRequest = new Request(url, request);
    forwardedRequest.headers.delete('host');

    return this.ctx.container!.getTcpPort(SERVER_PORT).fetch(forwardedRequest);
  }

  async ensureRunning(role: ContainerRole): Promise<void> {
    this.starting ??= this.start(role).finally(() => {
      this.starting = undefined;
    });

    await this.starting;
  }

  private async start(role: ContainerRole): Promise<void> {
    const container = this.ctx.container;

    if (!container) {
      throw new Error('Cloudflare Container binding is unavailable');
    }

    const encodedEnvironment = this.env.STREETLIGHT_RUNTIME_ENV_JSON;
    const runtimeEnvironment = parseRuntimeEnvironment(encodedEnvironment);
    const configurationFingerprint = await createConfigurationFingerprint(
      encodedEnvironment,
      role,
      this.env.STREETLIGHT_TENANT_SLUG,
    );
    const desiredImage = container.images.streetlight;

    if (container.running) {
      const containerInfo = await container.inspect();
      const canReplaceContainer =
        containerInfo !== null && containerInfo.image.length > 0;
      const requiresReplacement =
        canReplaceContainer &&
        (containerInfo.image !== desiredImage ||
          containerInfo.labels.configuration !== configurationFingerprint ||
          containerInfo.labels.role !== role ||
          containerInfo.labels.tenant !== this.env.STREETLIGHT_TENANT_SLUG);

      if (requiresReplacement) {
        await container.destroy();
        this.monitoring = undefined;
      }
    }

    let startedContainer = false;

    if (!container.running) {
      const roleEnvironment: Record<string, string> =
        role === 'server'
          ? {
              DISABLE_CRON_JOBS_REGISTRATION: 'false',
              DISABLE_DB_MIGRATIONS: 'false',
              FAIL_ON_DB_UPGRADE_ERROR: 'true',
              NODE_PORT: String(SERVER_PORT),
            }
          : {
              DISABLE_CRON_JOBS_REGISTRATION: 'true',
              DISABLE_DB_MIGRATIONS: 'true',
            };

      container.start({
        enableInternet: true,
        entrypoint:
          role === 'worker'
            ? ['/app/entrypoint.sh', 'yarn', 'worker:prod']
            : undefined,
        env: {
          ...runtimeEnvironment,
          ...roleEnvironment,
        },
        image: desiredImage,
        instance: INSTANCE_TYPE_BY_ROLE[role],
        labels: {
          configuration: configurationFingerprint,
          role,
          tenant: this.env.STREETLIGHT_TENANT_SLUG,
        },
      });
      startedContainer = true;
    }

    await container.setInactivityTimeout(CONTAINER_INACTIVITY_TIMEOUT_MS);
    const monitoring = this.observeContainer(role, container);

    if (role === 'server') {
      await this.waitForServer();
    } else if (startedContainer) {
      await Promise.race([
        monitoring,
        scheduler.wait(WORKER_STARTUP_GRACE_PERIOD_MS),
      ]);
    }
  }

  private observeContainer(
    role: ContainerRole,
    container: Container,
  ): Promise<void> {
    if (!this.monitoring) {
      const monitoring = container.monitor().then(() => {
        throw new Error(`Streetlight ${role} container stopped`);
      });

      this.monitoring = monitoring;
      this.ctx.waitUntil(
        monitoring
          .catch(() => {
            console.error(`Streetlight ${role} container monitor ended`);
          })
          .finally(() => {
            if (this.monitoring === monitoring) {
              this.monitoring = undefined;
            }
          }),
      );
    }

    return this.monitoring;
  }

  private async waitForServer(): Promise<void> {
    const serverPort = this.ctx.container!.getTcpPort(SERVER_PORT);
    let lastError: unknown;

    for (let attempt = 0; attempt < READY_ATTEMPTS; attempt += 1) {
      try {
        const response = await serverPort.fetch('http://container/healthz', {
          signal: AbortSignal.timeout(2_000),
        });
        await response.body?.cancel();

        if (!response.ok) {
          throw new Error(`Health check returned ${response.status}`);
        }

        return;
      } catch (error) {
        lastError = error;
        await scheduler.wait(READY_RETRY_DELAY_MS);
      }
    }

    throw new Error('Streetlight server did not become healthy', {
      cause: lastError,
    });
  }
}

const keepContainersRunning = async (environment: CloudflareEnv) => {
  await environment.STREETLIGHT_CONTAINER.getByName(
    `${environment.STREETLIGHT_TENANT_SLUG}-server`,
  ).ensureRunning('server');
  await environment.STREETLIGHT_CONTAINER.getByName(
    `${environment.STREETLIGHT_TENANT_SLUG}-worker`,
  ).ensureRunning('worker');
};

export default {
  async fetch(request: Request, environment: CloudflareEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/source') {
      return Response.redirect(environment.STREETLIGHT_SOURCE_URL, 302);
    }

    if (url.pathname === '/.well-known/streetlight-source') {
      return Response.json({
        revision: environment.STREETLIGHT_SOURCE_REVISION,
        source: environment.STREETLIGHT_SOURCE_URL,
      });
    }

    return environment.STREETLIGHT_CONTAINER.getByName(
      `${environment.STREETLIGHT_TENANT_SLUG}-server`,
    ).fetch(request);
  },
  scheduled(
    _controller: ScheduledController,
    environment: CloudflareEnv,
    context: ExecutionContext,
  ): void {
    context.waitUntil(keepContainersRunning(environment));
  },
} satisfies ExportedHandler<CloudflareEnv>;
