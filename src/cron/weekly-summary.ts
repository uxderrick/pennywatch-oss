import { query } from '../db/client.js';
import { bot } from '../telegram/bot.js';
import { config } from '../config.js';

interface CategoryComparison {
  category: string;
  total: number;
  prevTotal: number;
}

interface WeeklySummaryData {
  totalSpent: number;
  totalReceived: number;
  categories: CategoryComparison[];
  transfersTotal: number;
}

function fmtGhs(n: number): string {
  return n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatWeeklySummary(data: WeeklySummaryData): string {
  let msg = `📊 *Weekly Summary*\n\n`;
  msg += `Total Spent: GHS ${fmtGhs(data.totalSpent)}\n`;
  msg += `Total Received: GHS ${fmtGhs(data.totalReceived)}\n\n`;

  if (data.categories.length > 0) {
    msg += `*By Category:*\n`;
    for (const cat of data.categories) {
      let change = '';
      if (cat.prevTotal > 0) {
        const pctChange = Math.round(((cat.total - cat.prevTotal) / cat.prevTotal) * 100);
        const arrow = pctChange >= 0 ? '↑' : '↓';
        change = ` ${arrow}${Math.abs(pctChange)}% from last week`;
      }
      msg += `• ${cat.category}: GHS ${fmtGhs(cat.total)}${change}\n`;
    }
  }

  if (data.transfersTotal > 0) {
    msg += `\n💸 Internal transfers: GHS ${fmtGhs(data.transfersTotal)}`;
  }

  return msg;
}

export async function generateWeeklySummary(): Promise<void> {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);

  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(weekStart.getDate() - 7);

  // Current week totals
  const totals = await query<{ direction: string; total: number }>(
    `SELECT direction, SUM(amount)::numeric AS total
     FROM transactions
     WHERE type != 'transfer' AND transaction_date >= $1
     GROUP BY direction`,
    [weekStart],
  );

  let totalSpent = 0;
  let totalReceived = 0;
  for (const r of totals.rows) {
    if (r.direction === 'debit') totalSpent = Number(r.total);
    else totalReceived = Number(r.total);
  }

  // Category breakdown with comparison
  const categories = await query<{ category: string; total: number; prev_total: number }>(
    `SELECT
       curr.category,
       curr.total,
       COALESCE(prev.total, 0) AS prev_total
     FROM (
       SELECT category, SUM(amount)::numeric AS total
       FROM transactions
       WHERE direction = 'debit' AND type = 'expense' AND transaction_date >= $1
       GROUP BY category
     ) curr
     LEFT JOIN (
       SELECT category, SUM(amount)::numeric AS total
       FROM transactions
       WHERE direction = 'debit' AND type = 'expense'
         AND transaction_date >= $2 AND transaction_date < $1
       GROUP BY category
     ) prev ON curr.category = prev.category
     ORDER BY curr.total DESC`,
    [weekStart, prevWeekStart],
  );

  // Transfers total
  const transfers = await query<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0)::numeric AS total
     FROM transactions
     WHERE type = 'transfer' AND direction = 'debit' AND transaction_date >= $1`,
    [weekStart],
  );

  const data: WeeklySummaryData = {
    totalSpent,
    totalReceived,
    categories: categories.rows.map(r => ({
      category: r.category,
      total: Number(r.total),
      prevTotal: Number(r.prev_total),
    })),
    transfersTotal: Number(transfers.rows[0]?.total ?? 0),
  };

  const message = formatWeeklySummary(data);
  await bot.telegram.sendMessage(config.telegramChatId, message, { parse_mode: 'Markdown' });
}
