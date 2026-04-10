import { query } from '../db/client.js';
import { setBudget, listBudgets } from '../budgets/service.js';

interface CategoryTotal {
  category: string;
  total: number;
}

interface RecentTransaction {
  id: string;
  amount: number;
  direction: string;
  merchant: string;
  category: string;
  source: string;
  transaction_date: Date;
}

function fmtGhs(n: number): string {
  return n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(s: string): string {
  return s.replace(/_/g, '\\_').replace(/\*/g, '\\*').replace(/\[/g, '\\[').replace(/`/g, '\\`');
}

export function formatSummary(data: CategoryTotal[], total: number): string {
  if (data.length === 0) return '📊 No spending recorded this month yet.';
  let msg = `📊 *Spending Summary — ${new Date().toLocaleString('en-GH', { month: 'long', year: 'numeric' })}*\n\n`;
  for (const { category, total: catTotal } of data) {
    const pct = Math.round((catTotal / total) * 100);
    msg += `• ${esc(category)}: GHS ${fmtGhs(catTotal)} (${pct}%)\n`;
  }
  msg += `\n*Total: GHS ${fmtGhs(total)}*`;
  return msg;
}

export function formatBalance(credits: number, debits: number): string {
  const net = credits - debits;
  const sign = net >= 0 ? '+' : '';
  return `💰 *Cash Flow — ${new Date().toLocaleString('en-GH', { month: 'long', year: 'numeric' })}*\n\nIncome: GHS ${fmtGhs(credits)}\nSpending: GHS ${fmtGhs(debits)}\nNet: ${sign}GHS ${fmtGhs(net)}`;
}

export function formatRecent(txns: RecentTransaction[]): string {
  if (txns.length === 0) return '📋 No recent transactions.';
  let msg = '📋 *Recent Transactions*\n\n';
  for (const t of txns) {
    const arrow = t.direction === 'credit' ? '🟢' : '🔴';
    const date = t.transaction_date.toLocaleDateString('en-GH', { day: 'numeric', month: 'short' });
    msg += `${arrow} GHS ${fmtGhs(t.amount)} — ${esc(t.merchant || 'Unknown')} (${esc(t.category)})\n   ${date} via ${esc(t.source)}\n   ID: \`${t.id.slice(0, 8)}\`\n\n`;
  }
  return msg;
}

export function formatBudgetList(budgets: Array<{ category: string; monthly_limit: number; spent: number }>): string {
  if (budgets.length === 0) return '📋 No budgets set. Use /budget set <category> <amount>';
  let msg = '📋 *Active Budgets*\n\n';
  for (const b of budgets) {
    const pct = Math.round((b.spent / b.monthly_limit) * 100);
    const bar = pct >= 100 ? '🔴' : pct >= 80 ? '🟡' : '🟢';
    msg += `${bar} ${esc(b.category)}: GHS ${fmtGhs(b.spent)} / ${fmtGhs(b.monthly_limit)} (${pct}%)\n`;
  }
  return msg;
}

export async function handleSummary(): Promise<string> {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const result = await query<{ category: string; total: number }>(
    `SELECT category, SUM(amount)::numeric AS total
     FROM transactions
     WHERE direction = 'debit' AND type = 'expense'
       AND TO_CHAR(transaction_date, 'YYYY-MM') = $1
     GROUP BY category
     ORDER BY total DESC`,
    [currentMonth],
  );
  const rows = result.rows.map(r => ({ category: r.category, total: Number(r.total) }));
  const total = rows.reduce((sum, r) => sum + r.total, 0);
  return formatSummary(rows, total);
}

export async function handleBalance(): Promise<string> {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const result = await query<{ direction: string; total: number }>(
    `SELECT direction, SUM(amount)::numeric AS total
     FROM transactions
     WHERE type != 'transfer'
       AND TO_CHAR(transaction_date, 'YYYY-MM') = $1
     GROUP BY direction`,
    [currentMonth],
  );
  let credits = 0;
  let debits = 0;
  for (const r of result.rows) {
    if (r.direction === 'credit') credits = Number(r.total);
    else debits = Number(r.total);
  }
  return formatBalance(credits, debits);
}

export async function handleTop(): Promise<string> {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const result = await query<{ category: string; total: number }>(
    `SELECT category, SUM(amount)::numeric AS total
     FROM transactions
     WHERE direction = 'debit' AND type = 'expense'
       AND TO_CHAR(transaction_date, 'YYYY-MM') = $1
     GROUP BY category
     ORDER BY total DESC
     LIMIT 5`,
    [currentMonth],
  );
  const rows = result.rows.map(r => ({ category: r.category, total: Number(r.total) }));
  if (rows.length === 0) return '🏆 No spending data this month yet.';
  let msg = '🏆 *Top 5 Categories*\n\n';
  rows.forEach((r, i) => {
    msg += `${i + 1}. ${esc(r.category)}: GHS ${fmtGhs(r.total)}\n`;
  });
  return msg;
}

export async function handleRecent(): Promise<string> {
  const result = await query<RecentTransaction>(
    `SELECT id, amount, direction, merchant, category, source, transaction_date
     FROM transactions
     ORDER BY transaction_date DESC
     LIMIT 10`,
  );
  const rows = result.rows.map(r => ({ ...r, amount: Number(r.amount) }));
  return formatRecent(rows);
}

export async function handleBudgetSet(args: string[]): Promise<string> {
  if (args.length < 2) return '❌ Usage: /budget set <category> <amount>';
  const category = args[0].toLowerCase();
  const amount = parseFloat(args[1]);
  if (isNaN(amount) || amount <= 0) return '❌ Amount must be a positive number.';
  await setBudget(category, amount);
  return `✅ Budget set: ${category} → GHS ${fmtGhs(amount)}/month`;
}

export async function handleBudgetList(): Promise<string> {
  const budgets = await listBudgets();
  return formatBudgetList(budgets);
}

export async function handleFix(args: string[]): Promise<string> {
  if (args.length < 2) return '❌ Usage: /fix <transaction_id> <new_category>';
  const [txnIdPrefix, newCategory] = args;

  const result = await query<{ id: string; category: string; merchant: string }>(
    `SELECT id, category, merchant FROM transactions WHERE id::text LIKE $1 || '%' LIMIT 1`,
    [txnIdPrefix],
  );
  if (result.rows.length === 0) return `❌ No transaction found starting with "${txnIdPrefix}"`;

  const txn = result.rows[0];
  await query(
    `INSERT INTO category_overrides (transaction_id, original_category, new_category, merchant)
     VALUES ($1, $2, $3, $4)`,
    [txn.id, txn.category, newCategory, txn.merchant],
  );
  await query('UPDATE transactions SET category = $1 WHERE id = $2', [newCategory, txn.id]);

  return `✅ Updated: ${txn.merchant || txn.id.slice(0, 8)} → ${newCategory} (was ${txn.category})`;
}

export async function handleNotTransfer(args: string[]): Promise<string> {
  if (args.length < 1) return '❌ Usage: /not_transfer <transaction_id>';
  const txnIdPrefix = args[0];

  const result = await query<{ id: string; direction: string; transfer_group_id: string | null }>(
    `SELECT id, direction, transfer_group_id FROM transactions WHERE id::text LIKE $1 || '%' LIMIT 1`,
    [txnIdPrefix],
  );
  if (result.rows.length === 0) return `❌ No transaction found starting with "${txnIdPrefix}"`;

  const txn = result.rows[0];
  if (!txn.transfer_group_id) return '❌ This transaction is not part of a transfer pair.';

  // Unlink both transactions in the group
  await query(
    `UPDATE transactions SET type = CASE WHEN direction = 'credit' THEN 'income' ELSE 'expense' END,
       transfer_group_id = NULL
     WHERE transfer_group_id = $1`,
    [txn.transfer_group_id],
  );

  return `✅ Unlinked transfer pair. Transactions reset to income/expense.`;
}

export async function handleStreaks(): Promise<string> {
  const budgets = await query<{ category: string; monthly_limit: number }>(
    'SELECT category, monthly_limit FROM budgets',
  );

  if (budgets.rows.length === 0) return '🏆 No budgets set yet. Use /budget set <category> <amount> first.';

  const streaks: Array<{ category: string; weeks: number }> = [];
  const now = new Date();

  for (const budget of budgets.rows) {
    const limit = Number(budget.monthly_limit);
    const weeklyLimit = limit / 4.33;
    let consecutiveWeeks = 0;

    for (let i = 0; i < 12; i++) {
      const weekEnd = new Date(now);
      weekEnd.setDate(now.getDate() - (i * 7));
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekEnd.getDate() - 7);

      const result = await query<{ total: number }>(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS total
         FROM transactions
         WHERE category = $1 AND direction = 'debit' AND type = 'expense'
           AND transaction_date >= $2 AND transaction_date < $3`,
        [budget.category, weekStart, weekEnd],
      );
      const weeklySpend = Number(result.rows[0].total);

      if (weeklySpend <= weeklyLimit && weeklySpend > 0) {
        consecutiveWeeks++;
      } else if (weeklySpend > weeklyLimit) {
        break;
      }
    }

    if (consecutiveWeeks >= 1) {
      streaks.push({ category: budget.category, weeks: consecutiveWeeks });
    }
  }

  if (streaks.length === 0) return '🏆 No active streaks yet. Keep spending under budget to build streaks!';

  streaks.sort((a, b) => b.weeks - a.weeks);
  let msg = '🏆 *Budget Streaks*\n\n';
  for (const s of streaks) {
    const fire = '🔥'.repeat(Math.min(s.weeks, 5));
    msg += `${fire} ${esc(s.category)}: ${s.weeks} week${s.weeks > 1 ? 's' : ''} under budget\n`;
  }

  return msg;
}
