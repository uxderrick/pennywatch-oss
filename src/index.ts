import express from 'express';

import { config } from './config.js';
import { smsRouter } from './sms/router.js';
import { bot } from './telegram/bot.js';
import { startScheduler } from './cron/scheduler.js';

const app = express();
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SMS ingestion
app.use(smsRouter);

// Start server and bot
async function start(): Promise<void> {
  // Set up Telegram webhook
  const webhookCallback = await bot.createWebhook({
    domain: config.webhookDomain,
    path: '/api/telegram/webhook',
    secret_token: config.telegramWebhookSecret,
  });

  app.use(webhookCallback);

  // Start cron scheduler
  startScheduler();

  app.listen(config.port, () => {
    console.log(`PennyWatch server running on port ${config.port}`);
    console.log(`Telegram webhook: ${config.webhookDomain}/api/telegram/webhook`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
