# PennyWatch

Personal finance tracker that reads your bank SMS, parses them with AI, and gives you spending insights via Telegram. Works with any bank in any country.

## How It Works

```
Bank SMS → iOS Shortcut → Your Server → Claude Haiku → Postgres → Telegram Bot
```

1. Bank sends you a transaction SMS
2. iOS Shortcut detects it and POSTs the text to your server
3. Claude Haiku 4.5 extracts: amount, merchant, category, direction
4. Data is stored in Postgres
5. You query via Telegram: `/summary`, `/balance`, or plain English

## Features

- **Auto SMS parsing** — LLM extracts structured data from messy bank SMS
- **Transfer detection** — auto-links cross-account transfers so they don't inflate spending
- **Telegram bot** — 9 commands + natural language queries
- **Budget tracking** — set limits per category, get alerts at 80% and 100%
- **Weekly & monthly reports** — auto-sent via Telegram
- **Anomaly detection** — flags unusual spending patterns
- **Budget streaks** — tracks consecutive weeks under budget
- **Balance snapshots** — tracks account balances from balance-check SMS

## Quick Start

### 1. Get Your Credentials

You need 3 things:

| Credential | Where to get it |
|-----------|----------------|
| **Neon Postgres** | [neon.tech](https://neon.tech) — create a free project, copy the connection string |
| **Anthropic API key** | [console.anthropic.com](https://console.anthropic.com) — create an API key |
| **Telegram bot token** | Message [@BotFather](https://t.me/BotFather) on Telegram → `/newbot` |

To get your **Telegram chat ID**: message your bot, then visit:
```
https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
```
Look for `"chat": {"id": 123456789}`.

Generate an **SMS API key**:
```bash
openssl rand -hex 32
```

### 2. Configure

Edit `pennywatch.config.ts` — fill in your credentials and customize your banks:

```typescript
export default {
  databaseUrl: 'postgresql://user:pass@host/db?sslmode=require',
  anthropicApiKey: 'sk-ant-xxx',
  telegramBotToken: '123:ABC',
  telegramChatId: '123456789',
  webhookDomain: 'https://pennywatch.yourdomain.com',
  smsApiKey: 'your-generated-key',
  currency: 'GHS',
  banks: [
    { name: 'My Bank', id: 'my_bank', example: 'Sample SMS from my bank...' },
  ],
};
```

### 3. Set Up Database

Run the migration to create tables:

```bash
npm install
npx tsx src/db/migrate.ts
```

### 4. Deploy

**Option A: Docker**
```bash
docker compose up -d
```

**Option B: Direct**
```bash
npm install
npx tsx src/index.ts
```

**Option C: systemd (Linux server)**
```ini
# /etc/systemd/system/pennywatch.service
[Unit]
Description=PennyWatch
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/pennywatch
ExecStart=/usr/bin/npx tsx src/index.ts
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

You'll need HTTPS for Telegram webhooks. [Caddy](https://caddyserver.com) is the easiest:
```
pennywatch.yourdomain.com {
    reverse_proxy localhost:3000
}
```

### 5. Set Up iOS Shortcut

Create an automation in the Shortcuts app:

1. **Trigger**: Message contains your currency code (e.g., `GHS`, `KES`, `NGN`)
2. **Action**: POST to `https://your-domain/api/sms`
   - Header: `Authorization: Bearer <your-sms-api-key>`
   - Header: `Content-Type: application/json`
   - Body (JSON): `sms_body` = message body, `sender` = sender

### 6. Set Up Bot Commands

Message @BotFather → `/setcommands` → select your bot → paste:

```
summary - Spending breakdown this month
balance - Net cash flow this month
top - Top 5 spending categories
recent - Last 10 transactions
budget - Set or list budgets
streaks - Budget streaks and goals
monthly - Generate monthly summary
fix - Override a transaction category
not_transfer - Unlink a transfer pair
```

## Telegram Commands

| Command | Description |
|---------|------------|
| `/summary` | Spending by category this month |
| `/balance` | Credits - debits this month |
| `/top` | Top 5 spending categories |
| `/recent` | Last 10 transactions |
| `/budget set food 500` | Set monthly budget |
| `/budget list` | Show budgets with progress |
| `/streaks` | Budget streak tracker |
| `/monthly` | Generate monthly report |
| `/fix <id> <category>` | Correct a category |
| `/not_transfer <id>` | Unlink a transfer pair |
| *any text* | Natural language query |

## Customization

### Adding Your Banks

In `pennywatch.config.ts`, add entries to the `banks` array. Include a real example SMS — this helps the LLM parse accurately:

```typescript
banks: [
  {
    name: 'M-Pesa',
    id: 'mpesa',
    example: 'QH45TY67 Confirmed. Ksh500.00 sent to JOHN DOE 0712345678 on 9/4/26 at 2:30 PM. New balance is Ksh1,500.00.',
  },
],
```

### Changing Currency

Set `currency` in the config. The LLM uses this in parsing prompts:

```typescript
currency: 'KES',  // Kenyan Shilling
```

### Adjusting Cron Schedules

All schedules are in UTC. Modify in the config:

```typescript
weeklySummary: '0 19 * * 0',    // Sundays 7pm UTC
budgetAlerts: '0 9 * * *',      // Daily 9am UTC
```

## Cost

~$0.50/month for typical usage (500 SMS + 200 Telegram queries). Neon and Telegram are free.

## License

MIT
