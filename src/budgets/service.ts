import { query } from '../db/client.js';

export function formatBudgetAlert(
  category: string,
  spent: number,
  limit: number,
  threshold: number,
): string {
  const percentage = Math.round((spent / limit) * 100);
  if (threshold >= 100) {
    return `🚨 Budget exceeded: You've spent GHS ${spent.toFixed(2)} of your GHS ${limit.toFixed(2)} ${category} budget (${percentage}%).`;
  }
  const remaining = Math.round(100 - percentage);
  return `⚠️ Budget warning: You've spent GHS ${spent.toFixed(2)} of your GHS ${limit.toFixed(2)} ${category} budget (${percentage}%). ${remaining}% remaining for the rest of the month.`;
}

export async function setBudget(category: string, monthlyLimit: number): Promise<void> {
  await query(
    `INSERT INTO budgets (category, monthly_limit)
     VALUES ($1, $2)
     ON CONFLICT (category)
     DO UPDATE SET monthly_limit = $2, updated_at = NOW()`,
    [category, monthlyLimit],
  );
}

export async function listBudgets(): Promise<Array<{ category: string; monthly_limit: number; spent: number }>> {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const result = await query<{ category: string; monthly_limit: number; spent: number }>(
    `SELECT b.category, b.monthly_limit,
       COALESCE(SUM(t.amount), 0)::numeric AS spent
     FROM budgets b
     LEFT JOIN transactions t
       ON t.category = b.category
       AND t.direction = 'debit'
       AND t.type = 'expense'
       AND TO_CHAR(t.transaction_date, 'YYYY-MM') = $1
     GROUP BY b.category, b.monthly_limit
     ORDER BY b.category`,
    [currentMonth],
  );
  return result.rows.map(r => ({
    category: r.category,
    monthly_limit: Number(r.monthly_limit),
    spent: Number(r.spent),
  }));
}

export async function checkBudgetThresholds(category: string): Promise<string | null> {
  const currentMonth = new Date().toISOString().slice(0, 7);

  const budgetResult = await query<{ monthly_limit: number }>(
    'SELECT monthly_limit FROM budgets WHERE category = $1',
    [category],
  );
  if (budgetResult.rows.length === 0) return null;

  const limit = Number(budgetResult.rows[0].monthly_limit);

  const spentResult = await query<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0)::numeric AS total
     FROM transactions
     WHERE category = $1 AND direction = 'debit' AND type = 'expense'
       AND TO_CHAR(transaction_date, 'YYYY-MM') = $2`,
    [category, currentMonth],
  );
  const spent = Number(spentResult.rows[0].total);

  const percentage = (spent / limit) * 100;

  for (const threshold of [100, 80] as const) {
    if (percentage >= threshold) {
      const alertExists = await query(
        `SELECT id FROM budget_alerts_sent
         WHERE category = $1 AND threshold = $2 AND month = $3`,
        [category, threshold, currentMonth],
      );
      if (alertExists.rows.length === 0) {
        await query(
          `INSERT INTO budget_alerts_sent (category, threshold, month)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [category, threshold, currentMonth],
        );
        return formatBudgetAlert(category, spent, limit, threshold);
      }
    }
  }

  return null;
}
