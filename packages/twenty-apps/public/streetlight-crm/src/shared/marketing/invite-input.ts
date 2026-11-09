export const INVITE_CODE_PATTERN = /^[A-Za-z0-9]{10}$/;

const SIGNUP_TOKEN_PATTERN = /^[A-Za-z0-9]{32}$/;
const MAX_INVITE_NAME_LENGTH = 40;
const MAX_VISITOR_KEY_LENGTH = 64;
// A name must not hold a link or an address, so a period may only end a word.
const ALLOWED_NAME_PATTERN =
  /^[\p{L}\p{M}'’-]+\.?(?: +[\p{L}\p{M}'’-]+\.?)*$/u;
const CODE_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
// 248 is the largest multiple of 62 below 256, so byte % 62 stays uniform.
const UNBIASED_BYTE_LIMIT = 248;

export type InviteInput = {
  senderFirstName: string;
  friendFirstName: string;
  website: string;
  turnstileToken: string;
  visitorKey: string;
  inviteToken: string;
};

const readString = (value: unknown, maxLength: number): string =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

export const parseInviteName = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;

  const name = value.trim();

  if (
    name === '' ||
    name.length > MAX_INVITE_NAME_LENGTH ||
    !ALLOWED_NAME_PATTERN.test(name)
  ) {
    return null;
  }

  return name;
};

export const parseInviteInput = (
  body: unknown,
): { ok: true; value: InviteInput } | { ok: false; error: string } => {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Invalid request body.' };
  }

  const record = body as Record<string, unknown>;
  const senderFirstName = parseInviteName(record.senderFirstName);

  if (senderFirstName === null) {
    return { ok: false, error: 'Enter your first name. Use only letters.' };
  }

  const friendFirstName = parseInviteName(record.friendFirstName);

  if (friendFirstName === null) {
    return {
      ok: false,
      error: "Enter your friend's first name. Use only letters.",
    };
  }

  const visitorKey = readString(record.visitorKey, MAX_VISITOR_KEY_LENGTH + 1);
  const inviteToken = readString(record.inviteToken, 33);

  return {
    ok: true,
    value: {
      senderFirstName,
      friendFirstName,
      website:
        typeof record.website === 'string' ? record.website.slice(0, 200) : '',
      turnstileToken: readString(record.turnstileToken, 4096),
      visitorKey: visitorKey.length > MAX_VISITOR_KEY_LENGTH ? '' : visitorKey,
      inviteToken: SIGNUP_TOKEN_PATTERN.test(inviteToken) ? inviteToken : '',
    },
  };
};

export const generateRandomCode = (
  length: number,
  randomBytes: (size: number) => Uint8Array,
): string => {
  let code = '';

  while (code.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte >= UNBIASED_BYTE_LIMIT) continue;

      code += CODE_ALPHABET[byte % CODE_ALPHABET.length];

      if (code.length === length) break;
    }
  }

  return code;
};
