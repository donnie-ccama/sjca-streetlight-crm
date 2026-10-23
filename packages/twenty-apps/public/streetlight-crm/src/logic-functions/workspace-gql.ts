// Raw GraphQL transport shared by ALL logic functions in this app.
//
// Why raw GraphQL: this app operates on WORKSPACE-owned objects (donations,
// funds, donationCredits, dashboardSnapshot, …) that were provisioned outside
// the app manifest. The generated twenty-client-sdk embeds an app-scoped
// schema and validates queries against it AT RUNTIME, so any typed
// client.query()/client.mutation() touching those objects throws
// "type `Query` does not have a field …" in production. Raw requests have no
// such validation. (Standard-object calls without custom fields can keep
// using the typed client.)
//
// rawQuery()/rawMutation() accept genql-style selections so existing
// call-sites keep their structure:
//
//   await rawQuery({
//     donations: {
//       __args: { filter: { giftDate: { eq: '2026-08-25' } }, first: 10 },
//       edges: { node: { id: true, amount: { amountMicros: true } } },
//     },
//   });
//
// GraphQL enums must be wrapped: gqlEnum('HARD') serializes to HARD (no quotes).

/** Sends one raw GraphQL request to the workspace and returns `data`. */
export const gql = async (
  query: string,
  variables: Record<string, unknown> = {},
): Promise<Record<string, any>> => {
  const base = process.env.TWENTY_API_URL;
  const authToken =
    process.env.TWENTY_APP_ACCESS_TOKEN ?? process.env.TWENTY_API_KEY;
  if (!base || !authToken) {
    throw new Error(
      'Logic function env is missing TWENTY_API_URL or an access token (TWENTY_APP_ACCESS_TOKEN / TWENTY_API_KEY)',
    );
  }

  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/+$/, '')}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (error) {
    throw new Error(
      `Network error contacting Twenty API: ${error instanceof Error ? error.message : 'unknown'}`,
    );
  }

  if (!response.ok) {
    throw new Error(`Twenty API responded HTTP ${response.status}`);
  }

  const json = (await response.json()) as {
    data?: Record<string, any>;
    errors?: { message?: string }[];
  };
  if (json.errors?.length) {
    throw new Error(
      json.errors.map((e) => e.message ?? 'unknown GraphQL error').join('; '),
    );
  }
  return json.data ?? {};
};

// ───────────────────────── enum marker ────────────────────────────

export interface GqlEnumValue {
  readonly __gqlEnum: string;
}

export const gqlEnum = (value: string): GqlEnumValue => ({
  __gqlEnum: value,
});

type GqlValue =
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | GqlEnumValue
  | { [key: string]: GqlInput }
  | GqlInput[];

type GqlInput = GqlValue;

const serializeArg = (value: GqlInput): string => {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'object' && '__gqlEnum' in (value as GqlEnumValue)) {
    return (value as GqlEnumValue).__gqlEnum;
  }
  if (Array.isArray(value)) {
    return `[${value.map(serializeArg).join(', ')}]`;
  }
  const entries = Object.entries(value as Record<string, GqlInput>)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${serializeArg(v)}`);
  return `{ ${entries.join(', ')} }`;
};

const serializeSelection = (selection: Record<string, unknown>): string => {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(selection)) {
    if (key === '__args' || value === undefined) continue;
    if (value === true || value === null) {
      parts.push(key);
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      const inner = value as Record<string, unknown>;
      const args = inner.__args;
      const argsText = args
        ? Object.entries(args)
            .filter(([, v]) => v !== undefined)
            .map(([argName, argValue]) => `${argName}: ${serializeArg(argValue as GqlInput)}`)
            .join(', ')
        : '';
      parts.push(
        `${key}${argsText ? `(${argsText})` : ''} { ${serializeSelection(inner)} }`,
      );
    } else {
      throw new Error(`Unsupported selection value for field "${key}"`);
    }
  }
  return parts.join(' ');
};

const buildOperation = (
  kind: 'query' | 'mutation',
  rootName: string,
  rootSelection: Record<string, unknown>,
): string => {
  const body = serializeSelection({ [rootName]: rootSelection });
  return `${kind} { ${body} }`;
};

/** Exported for unit tests; builds the GraphQL document for one root field. */
export const serializeOperation = buildOperation;

/** Runs a typed-shape query against the workspace API and returns `data`. */
export const rawQuery = async (
  selection: Record<string, unknown>,
): Promise<Record<string, any>> => {
  const rootNames = Object.keys(selection);
  if (rootNames.length !== 1) {
    throw new Error('rawQuery expects exactly one root field');
  }
  return gql(buildOperation('query', rootNames[0], selection[rootNames[0]] as Record<string, unknown>));
};

/** Runs a typed-shape mutation against the workspace API and returns `data`. */
export const rawMutation = async (
  selection: Record<string, unknown>,
): Promise<Record<string, any>> => {
  const rootNames = Object.keys(selection);
  if (rootNames.length !== 1) {
    throw new Error('rawMutation expects exactly one root field');
  }
  return gql(
    buildOperation('mutation', rootNames[0], selection[rootNames[0]] as Record<string, unknown>),
  );
};
