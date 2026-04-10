import { bot } from '../telegram/bot.js';
import { config } from '../config.js';
import { query } from '../db/client.js';

function fmtGhs(n: number): string {
  return n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(s: string): string {
  return s.replace(/_/g, '\\_').replace(/\*/g, '\\*').replace(/\[/g, '\\[').replace(/`/g, '\\`');
}

export async function notifyUnparsed(smsBody: string, sender: string | undefined): Promise<void> {
  const preview = smsBody.length > 200 ? smsBody.slice(0, 200) + '...' : smsBody;
  const msg = `⚠️ *Unparsed SMS*\n\nFrom: ${sender || 'Unknown'}\n\n\`${preview}\`\n\nThis message couldn't be parsed. Use /fix to categorize it manually.`;
  await bot.telegram.sendMessage(config.telegramChatId, msg, { parse_mode: 'Markdown' });
}

export async function notifyNewTransaction(transactionId: string): Promise<void> {
  const result = await query<{
    amount: number;
    direction: string;
    type: string;
    merchant: string;
    category: string;
    source: string;
  }>(
    'SELECT amount, direction, type, merchant, category, source FROM transactions WHERE id = $1',
    [transactionId],
  );

  if (result.rows.length === 0) return;
  const txn = result.rows[0];

  // Skip if it was detected as a transfer — avoid noisy notifications for internal moves
  if (txn.type === 'transfer') return;

  const arrow = txn.direction === 'credit' ? '🟢 Received' : '🔴 Spent';
  const msg = `${arrow} *GHS ${fmtGhs(Number(txn.amount))}*\n${esc(txn.merchant || 'Unknown')} — ${esc(txn.category)}\nvia ${esc(txn.source)}`;

  await bot.telegram.sendMessage(config.telegramChatId, msg, { parse_mode: 'Markdown' });
}
