import { randomUUID } from 'node:crypto';

import { query } from '../db/client.js';

interface TransferCandidate {
  amount: number;
  direction: 'credit' | 'debit';
  source: string;
  transaction_date: Date;
}

const AMOUNT_TOLERANCE = 2; // GHS
const TIME_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export function isTransferMatch(
  txn: TransferCandidate,
  candidate: TransferCandidate,
): boolean {
  if (txn.direction === candidate.direction) return false;
  if (txn.source === candidate.source) return false;

  const amountDiff = Math.abs(txn.amount - candidate.amount);
  if (amountDiff > AMOUNT_TOLERANCE) return false;

  const timeDiff = Math.abs(
    txn.transaction_date.getTime() - candidate.transaction_date.getTime(),
  );
  if (timeDiff > TIME_WINDOW_MS) return false;

  return true;
}

export async function detectTransfer(transactionId: string): Promise<boolean> {
  const txnResult = await query<{
    id: string;
    amount: number;
    direction: string;
    source: string;
    transaction_date: Date;
    transfer_group_id: string | null;
  }>(
    'SELECT id, amount, direction, source, transaction_date, transfer_group_id FROM transactions WHERE id = $1',
    [transactionId],
  );

  if (txnResult.rows.length === 0) return false;
  const txn = txnResult.rows[0];
  if (txn.transfer_group_id) return false;

  const oppositeDirection = txn.direction === 'credit' ? 'debit' : 'credit';
  const windowStart = new Date(txn.transaction_date.getTime() - TIME_WINDOW_MS);
  const windowEnd = new Date(txn.transaction_date.getTime() + TIME_WINDOW_MS);

  const candidates = await query<{
    id: string;
    amount: number;
    direction: string;
    source: string;
    transaction_date: Date;
  }>(
    `SELECT id, amount, direction, source, transaction_date FROM transactions
     WHERE direction = $1
       AND source != $2
       AND transaction_date BETWEEN $3 AND $4
       AND transfer_group_id IS NULL
       AND id != $5
     ORDER BY transaction_date ASC
     LIMIT 5`,
    [oppositeDirection, txn.source, windowStart, windowEnd, transactionId],
  );

  for (const candidate of candidates.rows) {
    if (
      isTransferMatch(
        { amount: Number(txn.amount), direction: txn.direction as 'credit' | 'debit', source: txn.source, transaction_date: txn.transaction_date },
        { amount: Number(candidate.amount), direction: candidate.direction as 'credit' | 'debit', source: candidate.source, transaction_date: candidate.transaction_date },
      )
    ) {
      const groupId = randomUUID();
      await query(
        `UPDATE transactions SET type = 'transfer', transfer_group_id = $1 WHERE id = ANY($2::uuid[])`,
        [groupId, [transactionId, candidate.id]],
      );
      return true;
    }
  }

  return false;
}
