import { isValidTimeZone } from 'src/shared/marketing/online-gift-import';

// Empty means UTC; a bad name is logged once per run and also falls back to UTC.
export const resolveGiftTimeZone = (): string => {
  const timeZone = (process.env.GIFT_DATE_TIME_ZONE ?? '').trim();

  if (timeZone === '') return 'UTC';

  if (isValidTimeZone(timeZone)) return timeZone;

  console.log('GIFT_DATE_TIME_ZONE is not a valid IANA time zone; using UTC');

  return 'UTC';
};
