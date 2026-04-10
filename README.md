# PennyWatch

Personal finance tracker that reads your bank SMS, parses them with AI, and gives you spending insights via a Telegram bot. Self-hosted, single-user, works with any bank in any country.

**Cost:** ~$0.50/month (LLM calls only). Everything else is free tier.

---

## How It Works

```
Bank SMS → iOS Shortcut → Your Server → Claude Haiku 4.5 → Postgres → Telegram Bot
```

1. You receive a transaction SMS from your bank or mobile money service
2. An iOS Shortcut automation detects it and POSTs the SMS text to your server
3. The server classifies the SMS (transaction / balance check / other)
4. If it's a transaction, Claude Haiku 4.5 extracts: amount, merchant, category, direction
5. The parsed data is stored in Postgres
6. You get a Telegram notification 2 minutes later
7. You query your data anytime via Telegram commands or plain English

---

## Features

### Core
- **LLM-powered SMS parsing** — handles any bank's SMS format without custom regex
- **SMS classification** — distinguishes transactions from balance checks and promos
- **Transfer detection** — auto-links cross-account transfers (e.g., bank → mobile money) so they don't inflate spending
- **Deduplication** — same SMS won't be logged twice even if the Shortcut fires multiple times

### Telegram Bot (9 commands + natural language)
| Command | What it does |
|---------|-------------|
| `/summary` | Spending by category this month |
| `/balance` | Total income - spending this month |
| `/top` | Top 5 spending categories |
| `/recent` | Last 10 transactions |
| `/budget set food 500` | Set a monthly budget for a category |
| `/budget list` | Show all budgets with progress bars |
| `/streaks` | Consecutive weeks under budget per category |
| `/monthly` | Generate full monthly report on demand |
| `/fix <id> <category>` | Correct a transaction's category (teaches the AI for future SMS) |
| `/not_transfer <id>` | Unlink a falsely matched transfer pair |
| *any text* | Natural language query → LLM generates SQL → returns formatted results |

### Automated Reports
- **Weekly summary** — spending breakdown, week-over-week comparison (Sundays)
- **Monthly summary** — category breakdown, top merchants, month-over-month trends, budget streaks (1st of month)
- **Budget alerts** — warns at 80%, alerts at 100% of budget (daily check)
- **Anomaly detection** — flags spending 2x above your rolling average (daily check)
- **Transaction notifications** — Telegram message for each new transaction (2 min delay for transfer matching)
- **Unparsed SMS alerts** — instant notification when an SMS fails to parse

### Data
- **Balance snapshots** — tracks account balances from balance-check SMS
- **Category overrides** — corrections feed back into the AI prompt for future parsing
- **Audit log** — every incoming SMS is logged regardless of outcome

---

## Quick Start

### Prerequisites

- **Node.js 22+** (with npm)
- A server with HTTPS (for Telegram webhooks) — any VPS, Docker host, or cloud platform
- An iPhone (for the iOS Shortcut SMS trigger)

### Step 1: Get Your Credentials

You need 3 services (all have free tiers):

#### Neon Postgres (database)
1. Go to [neon.tech](https://neon.tech) and create a free account
2. Create a new project (any name)
3. Copy the connection string — it looks like: `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`

#### Anthropic API (LLM)
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an API key
3. Add a small credit balance ($5 will last months)

#### Telegram Bot
1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`, follow the prompts, and copy the **bot token**
3. Send any message to your new bot
4. Visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in your browser
5. Find `"chat":{"id":123456789}` — that number is your **chat ID**

#### SMS API Key
Generate a random key for authenticating the iOS Shortcut:
```bash
openssl rand -hex 32
```

### Step 2: Configure

```bash
git clone https://github.com/uxderrick/pennywatch-oss.git
cd pennywatch-oss
cp pennywatch.config.example.ts pennywatch.config.ts
```

Edit `pennywatch.config.ts`:

```typescript
export default {
  // Paste your Neon connection string
  databaseUrl: 'postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require',

  // Paste your Anthropic API key
  anthropicApiKey: 'sk-ant-xxx',

  // Paste your Telegram bot token and chat ID
  telegramBotToken: '123456789:ABCdef...',
  telegramChatId: '123456789',

  // Your server's public HTTPS URL
  webhookDomain: 'https://pennywatch.yourdomain.com',
  port: 3000,

  // The SMS API key you generated
  smsApiKey: 'your-random-key',

  // Your local currency
  currency: 'GHS',

  // Your banks — add examples so the AI parses accurately
  banks: [
    {
      name: 'My Bank',
      id: 'my_bank',
      example: 'Paste a real transaction SMS from this bank here',
    },
  ],

  // Suggested categories (AI can use others too)
  categories: [
    'food', 'transport', 'airtime', 'utilities', 'transfers',
    'entertainment', 'shopping', 'health', 'education', 'salary', 'other',
  ],
};
```

### Step 3: Install & Set Up Database

```bash
npm install
npm run migrate
```

You should see:
```
Running migration: 001-initial.sql
Completed: 001-initial.sql
All migrations complete.
```

### Step 4: Deploy

#### Option A: Docker (easiest)

```bash
# Make sure pennywatch.config.ts exists first
docker compose up -d
```

#### Option B: Direct (development)

```bash
npm start
```

#### Option C: Linux Server with systemd (production)

Create `/etc/systemd/system/pennywatch.service`:
```ini
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

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable pennywatch
sudo systemctl start pennywatch
```

#### HTTPS (required for Telegram webhooks)

[Caddy](https://caddyserver.com) is the easiest — auto-SSL with zero config:

```
# /etc/caddy/Caddyfile
pennywatch.yourdomain.com {
    reverse_proxy localhost:3000
}
```

### Step 5: Verify

Test the health endpoint:
```bash
curl https://your-domain/health
# {"status":"ok","timestamp":"2026-04-09T..."}
```

Test SMS ingestion:
```bash
curl -X POST https://your-domain/api/sms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SMS_API_KEY" \
  -d '{"sms_body": "Payment of KES 500 to Safaricom for airtime", "sender": "M-Pesa"}'
```

Send `/summary` to your Telegram bot — it should respond.

### Step 6: Set Up iOS Shortcut

#### Create the Shortcut
1. Open **Shortcuts** app on your iPhone
2. Tap **+** to create a new shortcut, name it **PennyWatch**
3. Add action: **Get Contents of URL**
   - URL: `https://your-domain/api/sms`
   - Method: **POST**
   - Headers:
     - `Authorization` → `Bearer YOUR_SMS_API_KEY`
     - `Content-Type` → `application/json`
   - Request Body: **JSON**
     - `sms_body` → tap and select **Shortcut Input**
     - `sender` → tap and select **Shortcut Input**, then change to **Sender**

#### Create the Automation
1. Go to **Automation** tab → **+** → **Message**
2. Set "Message contains" to your currency code (e.g., `GHS`, `KES`, `NGN`, `ZAR`)
3. Set to **Run Immediately** (not "Ask Before Running")
4. Action: **Run Shortcut** → select **PennyWatch**
5. For input, select **Message** → tap it and pick **Body**

#### Tips
- Add multiple keyword triggers for wider coverage: your currency code, `credited`, `debited`, `Payment`
- The dedup system prevents duplicates even if multiple automations trigger on the same SMS
- Test manually first: open the PennyWatch shortcut, tap Run, paste a sample SMS

### Step 7: Set Up Bot Commands

Message [@BotFather](https://t.me/BotFather) → `/setcommands` → select your bot → paste:

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

---

## Customization

### Banks

Add your banks to `pennywatch.config.ts`. Include a **real example SMS** from each bank — this dramatically improves parsing accuracy:

```typescript
banks: [
  {
    name: 'M-Pesa',
    id: 'mpesa',
    example: 'QH45TY67 Confirmed. Ksh500.00 sent to JOHN DOE 0712345678 on 9/4/26 at 2:30 PM. New balance is Ksh1,500.00.',
  },
  {
    name: 'Equity Bank',
    id: 'equity',
    example: 'Equity: Ksh10,000 debited from A/C XXX123 on 09/04/26. Ref: ATM Withdrawal. Bal: Ksh25,000.',
  },
],
```

### Currency

Set your currency code:
```typescript
currency: 'KES',  // Kenyan Shilling
currency: 'NGN',  // Nigerian Naira
currency: 'ZAR',  // South African Rand
currency: 'GHS',  // Ghanaian Cedi
```

### Categories

The AI uses these as suggestions but can assign any category. Add categories that match your spending:
```typescript
categories: ['food', 'transport', 'rent', 'groceries', 'airtime', 'utilities', 'salary', 'other'],
```

### Cron Schedules

All times are UTC. Adjust to your timezone:
```typescript
weeklySummary: '0 19 * * 0',      // Sundays 7pm UTC
monthlySummary: '0 8 1 * *',      // 1st of month 8am UTC
budgetAlerts: '0 9 * * *',        // Daily 9am UTC
anomalyDetection: '5 9 * * *',    // Daily 9:05am UTC
```

---

## How Transfer Detection Works

When you move money between your own accounts (e.g., bank → mobile money), you get two SMS:
- Bank: "500 debited"
- Mobile money: "500 received"

Without handling this, your spending would be inflated by the full transfer amount. PennyWatch automatically matches these by checking:
- Same amount (within a small fee tolerance)
- Opposite direction (one debit, one credit)
- Different source (different banks/services)
- Within 10 minutes of each other

Matched transactions are linked and excluded from spending totals. If the system gets it wrong, use `/not_transfer <id>` to unlink them.

---

## Architecture

```
src/
├── index.ts                 # Express server, mounts routes, starts cron
├── config.ts                # Reads pennywatch.config.ts
├── utils/format.ts          # Shared currency formatting and Markdown escaping
├── db/
│   ├── client.ts            # Postgres connection pools
│   ├── migrate.ts           # Migration runner
│   └── migrations/          # SQL migrations
├── sms/
│   ├── router.ts            # POST /api/sms endpoint
│   ├── parser.ts            # LLM classification and parsing
│   ├── dedup.ts             # SHA-256 deduplication
│   └── notifications.ts     # Telegram notifications for new transactions
├── transfers/
│   └── matcher.ts           # Cross-platform transfer detection
├── budgets/
│   └── service.ts           # Budget CRUD and threshold alerts
├── telegram/
│   ├── bot.ts               # Telegraf bot setup and command routing
│   ├── commands.ts          # Quick command handlers
│   └── nlp.ts               # Natural language → SQL queries
└── cron/
    ├── scheduler.ts          # Cron job registration
    ├── weekly-summary.ts     # Weekly spending report
    ├── monthly-summary.ts    # Monthly report with trends and streaks
    ├── budget-alerts.ts      # Budget threshold checker
    └── anomaly-detection.ts  # Spending anomaly detector
```

---

## Cost Estimate

| Service | Cost |
|---------|------|
| Neon Postgres | $0 (free tier: 0.5 GB) |
| Claude Haiku 4.5 | ~$0.50/mo (500 SMS + 200 queries) |
| Telegram Bot API | $0 |
| VPS (if needed) | $4-5/mo |
| **Total** | **$0.50 - $5/month** |

---

## Troubleshooting

### Bot not responding
```bash
sudo journalctl -u pennywatch -n 50 --no-pager
```
Common issues:
- Missing `?sslmode=require` in database URL
- Wrong Telegram bot token or chat ID
- HTTPS not configured (Telegram requires it for webhooks)

### SMS not being logged
1. Check the audit log: query `SELECT * FROM sms_audit_log ORDER BY created_at DESC LIMIT 10`
2. If audit log is empty → the iOS Shortcut isn't firing (check automation settings)
3. If audit log shows `invalid` → the Shortcut is sending empty body (check Shortcut Input mapping)
4. If audit log shows `unparsed` → the LLM couldn't parse it (add a bank example to your config)

### Duplicate transactions
The dedup system uses SHA-256 of the SMS body. If you see duplicates, they have slightly different text (extra whitespace, etc.). Check `raw_sms` in the transactions table.

### Markdown errors in Telegram
Special characters in merchant names (underscores, asterisks) can break Telegram's Markdown. PennyWatch escapes these, but if you see issues, check the server logs for send errors.

---

## License

MIT — see [LICENSE](LICENSE)
