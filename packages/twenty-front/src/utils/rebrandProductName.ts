import { doNotTranslate } from 'twenty-shared/i18n';

const upstreamProductName = doNotTranslate('Twenty');
const streetlightProductName = doNotTranslate('Streetlight CRM');

export const rebrandProductName = (message: string): string =>
  message.replaceAll(upstreamProductName, streetlightProductName);
