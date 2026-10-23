import type { DeploymentConfiguration } from './deployment-configuration';

type CloudflareFetch = (input: string, init: RequestInit) => Promise<Response>;

type CloudflareZone = {
  account: { id: string };
  id: string;
  name: string;
  status: string;
};

type CloudflareWorkerDomain = {
  hostname: string;
  service: string;
  zone_id: string;
  zone_name: string;
};

type CloudflareDnsRecord = {
  id: string;
  name: string;
  type: string;
};

const CLOUDFLARE_API_ORIGIN = 'https://api.cloudflare.com/client/v4';

const requestResult = async <TData>(
  path: string,
  apiToken: string,
  fetcher: CloudflareFetch,
): Promise<TData> => {
  const response = await fetcher(`${CLOUDFLARE_API_ORIGIN}${path}`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });

  if (!response.ok) {
    throw new Error(`Cloudflare preflight failed with HTTP ${response.status}`);
  }

  const body: unknown = await response.json();

  if (
    body === null ||
    typeof body !== 'object' ||
    !('success' in body) ||
    body.success !== true ||
    !('result' in body)
  ) {
    throw new Error('Cloudflare preflight returned an invalid response');
  }

  return body.result as TData;
};

export const preflightCloudflareTarget = async (
  deployment: DeploymentConfiguration,
  apiToken: string,
  fetcher: CloudflareFetch = fetch,
): Promise<void> => {
  const zone = await requestResult<CloudflareZone>(
    `/zones/${deployment.zoneId}`,
    apiToken,
    fetcher,
  );

  if (
    zone.id !== deployment.zoneId ||
    zone.name !== deployment.zoneName ||
    zone.account.id !== deployment.accountId ||
    zone.status !== 'active'
  ) {
    throw new Error(
      'Cloudflare zone does not match the active deployment account and zone',
    );
  }

  const domainQuery = new URLSearchParams({
    hostname: deployment.hostname,
    zone_id: deployment.zoneId,
  });
  const workerDomains = await requestResult<CloudflareWorkerDomain[]>(
    `/accounts/${deployment.accountId}/workers/domains?${domainQuery}`,
    apiToken,
    fetcher,
  );
  const conflictingWorkerDomain = workerDomains.find(
    (domain) =>
      domain.hostname !== deployment.hostname ||
      domain.service !== deployment.workerName ||
      domain.zone_id !== deployment.zoneId ||
      domain.zone_name !== deployment.zoneName,
  );

  if (conflictingWorkerDomain) {
    throw new Error('Hostname is assigned to a different Worker or zone');
  }

  const dnsQuery = new URLSearchParams({
    'name.exact': deployment.hostname,
    per_page: '100',
  });
  const dnsRecords = await requestResult<CloudflareDnsRecord[]>(
    `/zones/${deployment.zoneId}/dns_records?${dnsQuery}`,
    apiToken,
    fetcher,
  );

  if (dnsRecords.length > 0 && workerDomains.length === 0) {
    throw new Error('Hostname has a conflicting DNS record');
  }
};
