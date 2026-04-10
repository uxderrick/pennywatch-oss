import { createHash } from 'node:crypto';

export function computeSmsHash(smsBody: string, _receivedAt?: string): string {
  return createHash('sha256').update(smsBody).digest('hex');
}
