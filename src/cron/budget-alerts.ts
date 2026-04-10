import { query } from '../db/client.js';
import { formatBudgetAlert } from '../budgets/service.js';
import { bot } from '../telegram/bot.js';
import { config } from '../config.js';

export async function runBudgetAlerts(): Promise<void> {
  const currentMonth = new Date().toISOString().slice(0, 7);

  const budgets = await query<{ category: string; monthly_limit: number }>(
    'SELECT category, monthly_limit FROM budgets',
  );

  for (const budget of budgets.rows) {
    const limit = Number(budget.monthly_limit);

    const spentResult = await query<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS total
       FROM transactions
       WHERE category = $1 AND direction = 'debit' AND type = 'expense'
         AND TO_CHAR(transaction_date, 'YYYY-MM') = $2`,
      [budget.category, currentMonth],
    );
    const spent = Number(spentResult.rows[0].total);
    const percentage = (spent / limit) * 100;

    for (const threshold of [100, 80] as const) {
      if (percentage >= threshold) {
        const alertExists = await query(
          `SELECT id FROM budget_alerts_sent
           WHERE category = $1 AND threshold = $2 AND month = $3`,
          [budget.category, threshold, currentMonth],
        );

        if (alertExists.rows.length === 0) {
          await query(
            `INSERT INTO budget_alerts_sent (category, threshold, month)
             VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
            [budget.category, threshold, currentMonth],
          );

          const message = formatBudgetAlert(budget.category, spent, limit, threshold);
          await bot.telegram.sendMessage(config.telegramChatId, message);
          break; // Only send highest threshold alert
        }
      }
    }
  }
}
