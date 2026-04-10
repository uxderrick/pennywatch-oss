import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

import { config } from '../config.js';

export const SmsClassificationSchema = z.object({
  type: z.enum(['transaction', 'balance_check', 'other']),
  balance: z.number().nullable(),
  source: z.string(),
});

export type SmsClassification = z.infer<typeof SmsClassificationSchema>;

export const TransactionSchema = z.object({
  amount: z.number().positive(),
  direction: z.enum(['credit', 'debit']),
  merchant: z.string(),
  category: z.string(),
  transaction_date: z.string(),
  source: z.string(),
});

export type ParsedTransaction = z.infer<typeof TransactionSchema>;

interface CategoryOverride {
  merchant: string;
  new_category: string;
}

export function buildClassificationPrompt(smsBody: string): string {
  const bankList = config.banks.map(b => `"${b.id}"`).join(', ');
  return `Classify this bank/mobile money SMS message.

Return a JSON object with:
- type: "transaction" if it describes money sent, received, paid, or transferred. "balance_check" if it's just a balance inquiry/confirmation with no money movement. "other" if it's a promo, OTP, or unrelated message.
- balance: the current/available balance in ${config.currency} if mentioned (number or null)
- source: string identifying the bank/service (e.g. ${bankList || '"bank", "mobile_money"'} — use lowercase with underscores)

Examples:
- "Payment for ${config.currency}50 to Shoprite..." → transaction
- "Your balance is ${config.currency} 500.00. Stay alert..." → balance_check
- "Your OTP is 123456" → other
- "You have received ${config.currency}200 from John..." → transaction

SMS to classify:
${smsBody}`;
}

export function buildParsingPrompt(
  smsBody: string,
  overrides: CategoryOverride[],
): string {
  const categoryList = config.categories.join(', ');
  const bankExamples = config.banks.map(b => `${b.name}: "${b.example}"`).join('\n');

  let prompt = `Extract transaction details from this bank/mobile money SMS message.

Return a JSON object with these fields:
- amount: number (in ${config.currency}, no currency symbol)
- direction: "credit" or "debit"
- merchant: string (who/what the transaction was with)
- category: string (e.g. ${categoryList || 'food, transport, utilities, other'} — use lowercase, pick the most fitting)
- transaction_date: ISO 8601 date string
- source: string identifying the bank/service — use lowercase with underscores, infer from the SMS content`;

  if (bankExamples) {
    prompt += `\n\nExamples of SMS formats:\n\n${bankExamples}`;
  }

  if (overrides.length > 0) {
    prompt += '\n\nThe user has previously corrected these category assignments. Use them as guidance:';
    for (const o of overrides) {
      prompt += `\n- "${o.merchant}" should be categorized as "${o.new_category}"`;
    }
  }

  prompt += `\n\nSMS to parse:\n${smsBody}`;

  return prompt;
}

export async function classifySms(smsBody: string): Promise<SmsClassification> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const prompt = buildClassificationPrompt(smsBody);

  const message = await client.messages.parse({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 128,
    messages: [{ role: 'user', content: prompt }],
    output_config: {
      format: zodOutputFormat(SmsClassificationSchema),
    },
  });

  if (!message.parsed_output) {
    throw new Error('LLM returned no classification');
  }

  return message.parsed_output;
}

export async function parseSms(
  smsBody: string,
  overrides: CategoryOverride[],
): Promise<ParsedTransaction> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const prompt = buildParsingPrompt(smsBody, overrides);

  const message = await client.messages.parse({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
    output_config: {
      format: zodOutputFormat(TransactionSchema),
    },
  });

  if (!message.parsed_output) {
    throw new Error('LLM returned no parsed output');
  }

  return message.parsed_output;
}
