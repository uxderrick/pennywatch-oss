import { query } from '../db/client.js';
import { bot } from '../telegram/bot.js';
import { config } from '../config.js';
import { fmtAmount, esc } from '../utils/format.js';

interface MonthlySummaryData {
  month: string;
  totalSpent: number;
  totalReceived: number;
  categories: Array<{ category: string; total: number }>;
  topMerchants: Array<{ merchant: string; total: number; count: number }>;
  prevMonth: { totalSpent: number; totalReceived: number } | null;
  transfersTotal: number;
  streaks: Array<{ category: string; weeks: number }>;
}

export function formatMonthlySummary(data: MonthlySummaryData): string {
  const monthName = new Date(data.month + '-01').toLocaleString('en-US', { month: 'long', year: 'numeric' });
  let msg = `📊 *Monthly Summary — ${monthName}*\n\n`;

  msg += `Total Spent: ${fmtAmount(data.totalSpent)}\n`;
  msg += `Total Received: ${fmtAmount(data.totalReceived)}\n`;
  const net = data.totalReceived - data.totalSpent;
  msg += `Net: ${net >= 0 ? '+' : ''}${fmtAmount(Math.abs(net))}\n`;

  if (data.prevMonth) {
    const spendChange = data.prevMonth.totalSpent > 0
      ? Math.round(((data.totalSpent - data.prevMonth.totalSpent) / data.prevMonth.totalSpent) * 100)
      : 0;
    if (spendChange !== 0) {
      const arrow = spendChange > 0 ? '↑' : '↓';
      msg += `\n${arrow}${Math.abs(spendChange)}% spending vs last month\n`;
    }
  }

  if (data.categories.length > 0) {
    msg += `\n*By Category:*\n`;
    for (const cat of data.categories) {
      const pct = data.totalSpent > 0 ? Math.round((cat.total / data.totalSpent) * 100) : 0;
      msg += `• ${esc(cat.category)}: ${fmtAmount(cat.total)} (${pct}%)\n`;
    }
  }

  if (data.topMerchants.length > 0) {
    msg += `\n*Top Merchants:*\n`;
    for (const m of data.topMerchants) {
      msg += `• ${esc(m.merchant)}: ${fmtAmount(m.total)} (${m.count}x)\n`;
    }
  }

  if (data.transfersTotal > 0) {
    msg += `\n💸 Internal transfers: ${fmtAmount(data.transfersTotal)}`;
  }

  if (data.streaks.length > 0) {
    msg += `\n\n🏆 *Budget Streaks:*\n`;
    for (const s of data.streaks) {
      msg += `• ${esc(s.category)}: ${s.weeks} weeks under budget! 🔥\n`;
    }
  }

  return msg;
}

export async function generateMonthlySummary(): Promise<void> {
  // Run on the 1st — summarize the previous month
  const now = new Date();
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const currentMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
  const twoMonthsAgo = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() - 1, 1);
  const prevPrevMonth = `${twoMonthsAgo.getFullYear()}-${String(twoMonthsAgo.getMonth() + 1).padStart(2, '0')}`;

  // Current month totals
  const totals = await query<{ direction: string; total: number }>(
    `SELECT direction, SUM(amount)::numeric AS total
     FROM transactions
     WHERE type != 'transfer' AND TO_CHAR(transaction_date, 'YYYY-MM') = $1
     GROUP BY direction`,
    [currentMonth],
  );

  let totalSpent = 0;
  let totalReceived = 0;
  for (const r of totals.rows) {
    if (r.direction === 'debit') totalSpent = Number(r.total);
    else totalReceived = Number(r.total);
  }

  // Category breakdown
  const categories = await query<{ category: string; total: number }>(
    `SELECT category, SUM(amount)::numeric AS total
     FROM transactions
     WHERE direction = 'debit' AND type = 'expense'
       AND TO_CHAR(transaction_date, 'YYYY-MM') = $1
     GROUP BY category
     ORDER BY total DESC`,
    [currentMonth],
  );

  // Top merchants
  const merchants = await query<{ merchant: string; total: number; count: number }>(
    `SELECT merchant, SUM(amount)::numeric AS total, COUNT(*)::integer AS count
     FROM transactions
     WHERE direction = 'debit' AND type = 'expense'
       AND TO_CHAR(transaction_date, 'YYYY-MM') = $1
       AND merchant IS NOT NULL
     GROUP BY merchant
     ORDER BY total DESC
     LIMIT 5`,
    [currentMonth],
  );

  // Previous month comparison
  const prevTotals = await query<{ direction: string; total: number }>(
    `SELECT direction, SUM(amount)::numeric AS total
     FROM transactions
     WHERE type != 'transfer' AND TO_CHAR(transaction_date, 'YYYY-MM') = $1
     GROUP BY direction`,
    [prevPrevMonth],
  );

  let prevMonth: { totalSpent: number; totalReceived: number } | null = null;
  if (prevTotals.rows.length > 0) {
    let prevSpent = 0;
    let prevReceived = 0;
    for (const r of prevTotals.rows) {
      if (r.direction === 'debit') prevSpent = Number(r.total);
      else prevReceived = Number(r.total);
    }
    prevMonth = { totalSpent: prevSpent, totalReceived: prevReceived };
  }

  // Transfers total
  const transfers = await query<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0)::numeric AS total
     FROM transactions
     WHERE type = 'transfer' AND direction = 'debit'
       AND TO_CHAR(transaction_date, 'YYYY-MM') = $1`,
    [currentMonth],
  );

  // Budget streaks
  const streaks = await calculateBudgetStreaks();

  const data: MonthlySummaryData = {
    month: currentMonth,
    totalSpent,
    totalReceived,
    categories: categories.rows.map(r => ({ category: r.category, total: Number(r.total) })),
    topMerchants: merchants.rows.map(r => ({ merchant: r.merchant, total: Number(r.total), count: Number(r.count) })),
    prevMonth,
    transfersTotal: Number(transfers.rows[0]?.total ?? 0),
    streaks,
  };

  const message = formatMonthlySummary(data);
  await bot.telegram.sendMessage(config.telegramChatId, message, { parse_mode: 'Markdown' });
}

async function calculateBudgetStreaks(): Promise<Array<{ category: string; weeks: number }>> {
  const budgets = await query<{ category: string; monthly_limit: number }>(
    'SELECT category, monthly_limit FROM budgets',
  );

  const streaks: Array<{ category: string; weeks: number }> = [];

  for (const budget of budgets.rows) {
    const limit = Number(budget.monthly_limit);
    // Check how many consecutive weeks (going back) the category stayed under budget
    // We approximate: check each of the last 12 weeks
    let consecutiveWeeks = 0;
    const now = new Date();

    for (let i = 0; i < 12; i++) {
      const weekEnd = new Date(now);
      weekEnd.setDate(now.getDate() - (i * 7));
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekEnd.getDate() - 7);

      // Weekly pro-rated budget (monthly / 4.33)
      const weeklyLimit = limit / 4.33;

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
      // Skip weeks with zero spend (no data yet)
    }

    if (consecutiveWeeks >= 2) {
      streaks.push({ category: budget.category, weeks: consecutiveWeeks });
    }
  }

  return streaks.sort((a, b) => b.weeks - a.weeks);
}
