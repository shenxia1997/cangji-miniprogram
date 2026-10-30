/**
 * 性能基准：3000 笔交易（30% 为指定批次卖出）全量重放的耗时。
 * 目标：P50 ≤ 10ms（Node 环境，低端安卓机约慢 3~5 倍）。
 */
import { replay } from '../../domain/replay';
import { mulPriceQty } from '../../domain/money';
import type { Transaction } from '../../domain/types';

const DAY = 86_400_000;
const T0 = 1_700_000_000_000;

function build(count: number): Transaction[] {
  const txs: Transaction[] = [];
  const lotsByInst: Record<string, string[]> = {};
  let qty: Record<string, number> = {};

  for (let i = 0; i < count; i++) {
    const inst = `inst-${i % 20}`;
    lotsByInst[inst] = lotsByInst[inst] || [];
    qty[inst] = qty[inst] || 0;

    const isBuy = i < count * 0.6 || qty[inst] < 100_000;
    const quantity = isBuy ? 100_000 + (i % 5) * 10_000 : 50_000;
    const price = 30_000 + (i % 200) * 100;
    const uuid = `t${i}`;

    const tx: Transaction = {
      uuid,
      instrumentId: inst,
      accountId: 'acc-1',
      direction: isBuy ? 'buy' : 'sell',
      price,
      quantity,
      amount: mulPriceQty(price, quantity),
      feeItems: [{ type: 'commission', amount: 500 }],
      feeTotal: 500,
      method: 'auto_weighted',
      allocations: [],
      tradedAt: T0 + i * DAY,
      createdAt: T0 + i * DAY,
      rev: 1,
      deletedAt: 0,
      updatedAt: T0 + i * DAY,
    };

    if (isBuy) {
      lotsByInst[inst].push(uuid);
      qty[inst] += quantity;
    } else {
      // 30% 的卖出走指定批次，其余走加权
      if (i % 10 < 3) {
        const candidates = lotsByInst[inst].slice(-2);
        const usable = candidates.filter((c) => c);
        if (usable.length > 0 && qty[inst] >= quantity) {
          tx.method = 'specified';
          const first = usable[0];
          tx.allocations = [{ lotId: first, quantity: Math.min(quantity, 50_000) }];
          const rest = quantity - tx.allocations[0].quantity;
          if (rest > 0 && usable[1]) {
            tx.allocations.push({ lotId: usable[1], quantity: rest });
          } else if (rest > 0) {
            tx.method = 'auto_weighted';
            tx.allocations = [];
          }
        }
      }
      qty[inst] -= quantity;
    }

    if (tx.method === 'specified') {
      const sum = tx.allocations.reduce((a, x) => a + x.quantity, 0);
      if (sum !== tx.quantity) {
        tx.method = 'auto_weighted';
        tx.allocations = [];
      }
    }

    txs.push(tx);
  }
  return txs;
}

function percentile(values: number[], p: number): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

const txs = build(3000);
const runs: number[] = [];

for (let i = 0; i < 20; i++) {
  const start = process.hrtime.bigint();
  replay(txs, { defaultMethod: 'weighted', prices: {} });
  const end = process.hrtime.bigint();
  runs.push(Number(end - start) / 1e6);
}

const p50 = percentile(runs, 50);
const p90 = percentile(runs, 90);

console.log(`交易笔数: ${txs.length}`);
console.log(`重放耗时 P50: ${p50.toFixed(2)}ms`);
console.log(`重放耗时 P90: ${p90.toFixed(2)}ms`);
console.log(p50 <= 10 ? 'PASS: 达到 ≤10ms 目标' : 'FAIL: 超过 10ms 目标');
