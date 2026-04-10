import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';

import { config } from '../config.js';
import {
  handleSummary, handleBalance, handleTop, handleRecent,
  handleBudgetSet, handleBudgetList, handleFix, handleNotTransfer,
  handleStreaks,
} from './commands.js';
import { handleNaturalLanguageQuery } from './nlp.js';
import { generateMonthlySummary } from '../cron/monthly-summary.js';

export const bot = new Telegraf(config.telegramBotToken);

function isAuthorized(chatId: number): boolean {
  return String(chatId) === config.telegramChatId;
}

bot.use(async (ctx, next) => {
  if (ctx.chat && !isAuthorized(ctx.chat.id)) {
    await ctx.reply('Unauthorized.');
    return;
  }
  await next();
});

bot.command('summary', async (ctx) => {
  const msg = await handleSummary();
  await ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('balance', async (ctx) => {
  const msg = await handleBalance();
  await ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('top', async (ctx) => {
  const msg = await handleTop();
  await ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('recent', async (ctx) => {
  const msg = await handleRecent();
  await ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('budget', async (ctx) => {
  const args = ctx.args;
  if (args.length === 0 || args[0] === 'list') {
    const msg = await handleBudgetList();
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } else if (args[0] === 'set') {
    const msg = await handleBudgetSet(args.slice(1));
    await ctx.reply(msg);
  } else {
    await ctx.reply('Usage: /budget list or /budget set <category> <amount>');
  }
});

bot.command('fix', async (ctx) => {
  const msg = await handleFix(ctx.args);
  await ctx.reply(msg);
});

bot.command('not_transfer', async (ctx) => {
  const msg = await handleNotTransfer(ctx.args);
  await ctx.reply(msg);
});

bot.command('streaks', async (ctx) => {
  const msg = await handleStreaks();
  await ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('monthly', async (ctx) => {
  await ctx.reply('Generating monthly summary...');
  await generateMonthlySummary();
});

// Natural language queries — any non-command text
bot.on(message('text'), async (ctx) => {
  const msg = await handleNaturalLanguageQuery(ctx.message.text);
  await ctx.reply(msg, { parse_mode: 'Markdown' });
});
