/**
 * 属性测试：随机生成交易序列，验证 6 条不变量。
 * I1 份额守恒 / I2 批次守恒 / I3 成本守恒 / I4 总额守恒 / I5 删除幂等 / I6 顺序无关
 */
import fc from 'fast-check';
import { replay } from '../../domain/replay';
import type { Transaction } from '../../domain/types';
import { CONFIG, T0, makeBuy, makeSell } from '../fixtures/golden';

type Method = 'auto_weighted' | 'auto_fifo';

interface BuySpec {
  qty: number;
  price: number;
  fee: number;
}

function buildBuys(specs: BuySpec[]): Transaction[] {
  return specs.map((s, i) =>
    makeBuy({ uuid: `b${i}`, qty: s.qty, priceLi: s.price, feeCents: s.fee, at: T0 + i * 1_000 })
  );
}

function scenario(specs: BuySpec[], pcts: number[], kind: Method) {
  const buys = buildBuys(specs);
  const totalBuy = specs.reduce((a, s) => a + s.qty, 0);

  const sells: Transaction[] = [];
  let remaining = totalBuy;
  let idx = 0;
  for (const p of pcts) {
    if (remaining <= 0) break;
    const qty = Math.min(Math.max(1, Math.floor((remaining * p) / 100)), remaining);
    sells.push(
      makeSell({
        uuid: `s${idx}`,
        qty,
        priceLi: 50_000,
        feeCents: 300,
        at: T0 + 100_000 + idx * 1_000,
        method: kind,
      })
    );
    remaining -= qty;
    idx += 1;
  }
  return { buys, sells, totalBuy, totalSold: totalBuy - remaining };
}

const buysArb = fc.array(
  fc.record({
    qty: fc.integer({ min: 1_000, max: 50_000 }),
    price: fc.integer({ min: 100, max: 200_000 }),
    fee: fc.integer({ min: 0, max: 1_000 }),
  }),
  { minLength: 1, maxLength: 6 }
);

const pctsArb = fc.array(fc.integer({ min: 5, max: 100 }), { minLength: 0, maxLength: 6 });

describe('不变量 I1–I4 · 加权与先进先出', () => {
  test.each(['auto_weighted', 'auto_fifo'] as Method[])('%s：守恒恒成立', (kind) => {
    fc.assert(
      fc.property(buysArb, pctsArb, (specs, pcts) => {
        const { buys, sells, totalBuy, totalSold } = scenario(specs, pcts, kind);
        const r = replay([...buys, ...sells], CONFIG);
        const initial = replay(buys, CONFIG);
        const initialCost = initial.lots.reduce((a, l) => a + l.costTotal, 0);

        const posQty = r.positions.reduce((a, p) => a + p.quantity, 0);
        const posCost = r.positions.reduce((a, p) => a + p.costTotal, 0);
        const lotQty = r.lots.reduce((a, l) => a + l.remainQuantity, 0);
        const lotCost = r.lots.reduce((a, l) => a + l.remainCost, 0);
        const costOut = r.sells.reduce((a, s) => a + s.costOut, 0);
        const sellAmount = r.sells.reduce((a, s) => a + s.amount, 0);
        const sellFee = r.sells.reduce((a, s) => a + s.feeTotal, 0);

        expect(r.anomalies).toHaveLength(0);
        // I1 份额守恒
        expect(posQty).toBe(totalBuy - totalSold);
        // I2 批次守恒
        expect(lotQty).toBe(posQty);
        // I3 成本守恒
        expect(lotCost).toBe(posCost);
        expect(costOut + lotCost).toBe(initialCost);
        // I4 总额守恒
        expect(r.realizedPnl).toBe(sellAmount - costOut - sellFee);
      }),
      { numRuns: 2_000 }
    );
  });
});

describe('不变量 I5 · 删除幂等', () => {
  test('删除后再删除同一笔，结果不变', () => {
    fc.assert(
      fc.property(buysArb, pctsArb, (specs, pcts) => {
        const { buys, sells } = scenario(specs, pcts, 'auto_weighted');
        if (sells.length === 0) return;
        const target = sells[0].uuid;
        const once = [...buys, ...sells].map((t) =>
          t.uuid === target ? { ...t, deletedAt: T0 + 999_999 } : t
        );
        const twice = once.map((t) =>
          t.uuid === target ? { ...t, deletedAt: T0 + 888_888 } : t
        );
        expect(replay(once, CONFIG)).toEqual(replay(twice, CONFIG));
      }),
      { numRuns: 500 }
    );
  });
});

describe('不变量 I6 · 顺序无关', () => {
  test.each(['auto_weighted', 'auto_fifo'] as Method[])('%s：打乱输入结果一致', (kind) => {
    fc.assert(
      fc.property(buysArb, pctsArb, (specs, pcts) => {
        const { buys, sells } = scenario(specs, pcts, kind);
        const forward = replay([...buys, ...sells], CONFIG);
        const backward = replay([...sells, ...buys].reverse(), CONFIG);
        expect(backward.positions).toEqual(forward.positions);
        expect(backward.lots).toEqual(forward.lots);
        expect(backward.realizedPnl).toBe(forward.realizedPnl);
      }),
      { numRuns: 1_000 }
    );
  });
});

describe('不变量 · 指定批次单笔', () => {
  test('全量卖出单一批次时，结转等于该批次成本，状态为 closed', () => {
    fc.assert(
      fc.property(
        fc.record({
          qty: fc.integer({ min: 1_000, max: 50_000 }),
          price: fc.integer({ min: 100, max: 200_000 }),
          fee: fc.integer({ min: 0, max: 1_000 }),
          sellPrice: fc.integer({ min: 100, max: 200_000 }),
        }),
        (s) => {
          const buy = makeBuy({
            uuid: 'b0',
            qty: s.qty,
            priceLi: s.price,
            feeCents: s.fee,
            at: T0,
          });
          const sell = makeSell({
            uuid: 's0',
            qty: s.qty,
            priceLi: s.sellPrice,
            feeCents: 500,
            at: T0 + 1_000,
            method: 'specified',
            allocations: [{ lotId: 'b0', quantity: s.qty }],
          });
          const r = replay([buy, sell], CONFIG);
          const lot = r.lots[0];
          const expectedCost = buy.amount + buy.feeTotal;
          expect(r.anomalies).toHaveLength(0);
          expect(r.sells[0].costOut).toBe(expectedCost);
          expect(lot.status).toBe('closed');
          expect(lot.remainCost).toBe(0);
          expect(r.realizedPnl).toBe(sell.amount - expectedCost - 500);
        }
      ),
      { numRuns: 500 }
    );
  });
});
