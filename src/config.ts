import userConfig from '../pennywatch.config.js';

export const config = {
  databaseUrl: userConfig.databaseUrl,
  databaseReadonlyUrl: userConfig.databaseUrl,
  anthropicApiKey: userConfig.anthropicApiKey,
  telegramBotToken: userConfig.telegramBotToken,
  telegramWebhookSecret: userConfig.smsApiKey,
  telegramChatId: userConfig.telegramChatId,
  webhookDomain: userConfig.webhookDomain,
  smsApiKey: userConfig.smsApiKey,
  port: userConfig.port ?? 3000,
  currency: userConfig.currency ?? 'GHS',
  banks: userConfig.banks ?? [],
  categories: userConfig.categories ?? [],
  cronSchedule: {
    weeklySummary: userConfig.weeklySummary ?? '0 19 * * 0',
    monthlySummary: userConfig.monthlySummary ?? '0 8 1 * *',
    budgetAlerts: userConfig.budgetAlerts ?? '0 9 * * *',
    anomalyDetection: userConfig.anomalyDetection ?? '5 9 * * *',
  },
} as const;
