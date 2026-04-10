import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

import { config } from '../config.js';
import { readonlyQuery } from '../db/client.js';

const SqlQuerySchema = z.object({
  sql: z.string(),
  explanation: z.string(),
});

const ResponseSchema = z.object({
  response: z.string(),
});

function buildSchemaContext(): string {
  const bankList = config.banks.map(b => `"${b.id}"`).join(', ') || '"bank_name"';
  const categoryList = config.categories.join(', ') || 'food, transport, utilities, other';

  return `Database schema:

Table "transactions":
- id: UUID (primary key)
- amount: DECIMAL(12,2) — transaction amount in ${config.currency}
- currency: VARCHAR(3) — "${config.currency}"
- direction: VARCHAR(6) — "credit" or "debit"
- type: VARCHAR(10) — "expense", "income", or "transfer"
- merchant: TEXT — merchant or counterparty name
- category: VARCHAR(50) — e.g. ${categoryList}
- source: VARCHAR(50) — e.g. ${bankList}
- sender: TEXT — SMS sender number
- transfer_group_id: UUID — nullable, links paired transfer transactions
- transaction_date: TIMESTAMPTZ — when the transaction occurred
- created_at: TIMESTAMPTZ — when we ingested it

Table "budgets":
- id: UUID
- category: VARCHAR(50) UNIQUE
- monthly_limit: DECIMAL(12,2)

Table "category_overrides":
- id: UUID
- transaction_id: UUID (FK → transactions.id)
- original_category: VARCHAR(50)
- new_category: VARCHAR(50)
- merchant: TEXT

Important notes:
- Transfers (type = 'transfer') should be excluded from spending/income calculations unless specifically asked about
- Currency is always ${config.currency}
- Use SUM, AVG, COUNT for aggregations
- Use TO_CHAR(transaction_date, 'YYYY-MM') for monthly grouping`;
}

export function buildQueryPrompt(question: string): string {
  return `You are a financial analysis assistant. The user will ask questions about their spending data stored in a PostgreSQL database.

${buildSchemaContext()}

Generate a read-only SELECT query to answer the user's question. Only use SELECT statements — no INSERT, UPDATE, DELETE, DROP, or any write operations.

User question: ${question}`;
}

export async function handleNaturalLanguageQuery(question: string): Promise<string> {
  try {
    const client = new Anthropic({ apiKey: config.anthropicApiKey });

    // Step 1: Generate SQL query
    const queryPrompt = buildQueryPrompt(question);
    const queryMessage = await client.messages.parse({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: queryPrompt }],
      output_config: {
        format: zodOutputFormat(SqlQuerySchema),
      },
    });

    if (!queryMessage.parsed_output) {
      return '❌ Sorry, I couldn\'t understand that question. Try rephrasing or use a command like /summary.';
    }

    const { sql } = queryMessage.parsed_output;

    // Safety: reject anything that isn't a SELECT, or contains multiple statements
    const trimmed = sql.trim().toUpperCase();
    if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH')) {
      return '❌ I can only run read-only queries. Try asking a question about your spending.';
    }
    if (sql.includes(';')) {
      return '❌ Only single queries are allowed.';
    }

    // Step 2: Execute query on readonly connection
    const result = await readonlyQuery(sql);

    // Step 3: Format results with LLM
    const formatMessage = await client.messages.parse({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `The user asked: "${question}"

The SQL query returned these results:
${JSON.stringify(result.rows, null, 2)}

Format this into a clear, readable Telegram message. Use ${config.currency} as the currency. Keep it concise. Use markdown formatting (* for bold).`,
        },
      ],
      output_config: {
        format: zodOutputFormat(ResponseSchema),
      },
    });

    return formatMessage.parsed_output?.response ?? '❌ Could not format the response.';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('statement_timeout') || message.includes('timeout')) {
      return '⏱️ That query took too long. Try asking something simpler.';
    }
    return `❌ Error: ${message}`;
  }
}
