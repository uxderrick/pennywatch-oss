import cron from 'node-cron';

import { config } from '../config.js';
import { generateWeeklySummary } from './weekly-summary.js';
import { runBudgetAlerts } from './budget-alerts.js';
import { runAnomalyDetection } from './anomaly-detection.js';
import { generateMonthlySummary } from './monthly-summary.js';

function scheduleCron(schedule: string, name: string, fn: () => Promise<void>): void {
  cron.schedule(schedule, async () => {
    console.log(`[cron] Running ${name}...`);
    try {
      await fn();
      console.log(`[cron] ${name} done.`);
    } catch (err) {
      console.error(`[cron] ${name} failed:`, err);
    }
  }, { timezone: 'UTC' });
}

export function startScheduler(): void {
  const s = config.cronSchedule;
  scheduleCron(s.weeklySummary, 'weekly summary', generateWeeklySummary);
  scheduleCron(s.monthlySummary, 'monthly summary', generateMonthlySummary);
  scheduleCron(s.budgetAlerts, 'budget alerts', runBudgetAlerts);
  scheduleCron(s.anomalyDetection, 'anomaly detection', runAnomalyDetection);

  console.log('[cron] Scheduler started');
}
