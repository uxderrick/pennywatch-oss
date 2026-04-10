import { query } from '../db/client.js';
import { bot } from '../telegram/bot.js';
import { config } from '../config.js';

function fmtGhs(n: number): string {
  return n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function isAnomaly(currentWeek: number, weeklyAverage: number): boolean {
  if (weeklyAverage === 0) return false;
  return currentWeek >= 2 * weeklyAverage;
}

export function formatAnomalyAlert(category: string, current: number, average: number): string {
  return `🔍 Unusual spending: You've spent GHS ${fmtGhs(current)} on ${category} this week. Your weekly average is GHS ${fmtGhs(average)}.`;
}

export async function runAnomalyDetection(): Promise<void> {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

  const categories = await query<{ category: string }>(
    `SELECT DISTINCT category FROM transactions
     WHERE direction = 'debit' AND type = 'expense'
       AND transaction_date >= $1`,
    [thirtyDaysAgo],
  );

  for (const { category } of categories.rows) {
    const currentResult = await query<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS total
       FROM transactions
       WHERE category = $1 AND direction = 'debit' AND type = 'expense'
         AND transaction_date >= $2`,
      [category, weekStart],
    );
    const currentWeek = Number(currentResult.rows[0].total);

    const avgResult = await query<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS total
       FROM transactions
       WHERE category = $1 AND direction = 'debit' AND type = 'expense'
         AND transaction_date >= $2 AND transaction_date < $3`,
      [category, thirtyDaysAgo, weekStart],
    );
    const thirtyDayTotal = Number(avgResult.rows[0].total);
    const weeksInPeriod = (weekStart.getTime() - thirtyDaysAgo.getTime()) / (7 * 24 * 60 * 60 * 1000);
    const weeklyAverage = weeksInPeriod > 0 ? thirtyDayTotal / weeksInPeriod : 0;

    if (isAnomaly(currentWeek, weeklyAverage)) {
      const message = formatAnomalyAlert(category, currentWeek, weeklyAverage);
      await bot.telegram.sendMessage(config.telegramChatId, message);
    }
  }
}
