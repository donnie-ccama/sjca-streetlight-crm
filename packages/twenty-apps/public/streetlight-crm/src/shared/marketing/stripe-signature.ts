import { createHmac, timingSafeEqual } from 'node:crypto';

const TOLERANCE_SECONDS = 300;

const safeEqualHex = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
};

export const verifyStripeSignature = ({
  rawBody,
  header,
  secret,
  nowSeconds,
}: {
  rawBody: string;
  header: string;
  secret: string;
  nowSeconds: number;
}): boolean => {
  if (header === '' || secret === '') {
    return false;
  }

  let timestamp = '';
  const signatures: string[] = [];

  for (const part of header.split(',')) {
    const separatorIndex = part.indexOf('=');

    if (separatorIndex === -1) continue;

    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();

    if (key === 't') timestamp = value;
    if (key === 'v1') signatures.push(value);
  }

  const timestampSeconds = Number(timestamp);

  if (
    timestamp === '' ||
    !Number.isFinite(timestampSeconds) ||
    signatures.length === 0 ||
    Math.abs(nowSeconds - timestampSeconds) > TOLERANCE_SECONDS
  ) {
    return false;
  }

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  return signatures.some((signature) => safeEqualHex(signature, expected));
};
