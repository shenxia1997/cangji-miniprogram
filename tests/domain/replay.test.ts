import { replay } from '../../domain/replay';
import type { Transaction } from '../../domain/types';
import {
  BUYS,
  CONFIG,
  EXPECT,
  INSTRUMENT,
  SELL_A,
  SELL_B,
  T0,
  makeSell,
} from '../fixtures/golden';

const pos = (r: ReturnType<typeof replay>) => r.positions.find((p) => p.instrumentId === INSTRUMENT)!;
const lot = (r: ReturnType<typeof replay>, id: string) => r.lots.find((l) => l.lotId === id)!;

describe('D3 回归 · 批次标识的稳定性', () => {
  test('删除第一笔买入后，指向 b2/b3 的卖出引用仍然有效', () => {
    const deleted = BUYS.map((t) =>
      t.uuid === 'lot-b1' ? { ...t, deletedAt: T0 + 9_000 } : t
    );
    const r = replay([...deleted, makeSell(SELL_B)], CONFIG);

    expect(r.anomalies).toHaveLength(0);
    expect(r.sells).toHaveLength(1);
    // b2 的剩余成本与未被删除时一致，说明引用没有错位
    expect(lot(r, 'lot-b2').remainCost).toBe(EXPECT.caseB.b2.cost);
    expect(lot(r, 'lot-b3').remainCost).toBe(EXPECT.caseB.b3.cost);
  });

  test('顺序号语义的反证：中间插入一笔买入不改变已有批次引用', () => {
    const inserted: Transaction = {
      ...BUYS[0],
      uuid: 'lot-b0',
      tradedAt: T0 - 86_400_000,
      createdAt: T0 - 86_400_000,
      price: 53_000,
    };
    const r = replay([inserted, ...BUYS, makeSell(SELL_B)], CONFIG);
    expect(r.anomalies).toHaveLength(0);
    expect(lot(r, 'lot-b3').remainQuantity).toBe(100_000);
  });
});

describe('重放 · 排序确定性', () => {
  test('乱序补录按成交时间重放，不受输入顺序影响', () => {
    const backfilled: Transaction = {
      ...BUYS[0],
      uuid: 'lot-back',
      tradedAt: T0 + 10 * 86_400_000,
      createdAt: T0 + 20 * 86_400_000,
    };
    const a = replay([...BUYS, backfilled], CONFIG);
    const b = replay([backfilled, ...BUYS].reverse(), CONFIG);
    expect(a.positions).toEqual(b.positions);
    expect(a.lots).toEqual(b.lots);
  });

  test('同一时间戳的两笔卖出，结果与输入顺序无关', () => {
    const s1 = makeSell({ ...SELL_A, uuid: 's1' });
    const s2 = makeSell({ ...SELL_A, uuid: 's2', qty: 100_000 });
    const x = replay([...BUYS, s1, s2], CONFIG);
    const y = replay([...BUYS, s2, s1], CONFIG);
    expect(x.sells.map((s) => s.uuid)).toEqual(y.sells.map((s) => s.uuid));
    expect(pos(x).costTotal).toBe(pos(y).costTotal);
  });

  test('软删除的交易视为从未发生', () => {
    const sold = makeSell(SELL_A);
    const r = replay([...BUYS, { ...sold, deletedAt: T0 + 9_000 }], CONFIG);
    expect(r.sells).toHaveLength(0);
    expect(pos(r).quantity).toBe(EXPECT.initial.quantity);
  });
});

describe('重放 · 异常捕获', () => {
  test('超卖标记 E_OVERSELL 且不阻断其他交易', () => {
    const over = makeSell({ ...SELL_A, uuid: 'over', qty: 2_000_000, method: 'auto_weighted' });
    const r = replay([...BUYS, over], CONFIG);
    expect(r.anomalies).toHaveLength(1);
    expect(r.anomalies[0].code).toBe('E_OVERSELL');
    expect(pos(r).quantity).toBe(EXPECT.initial.quantity);
  });

  test('分配合计不符标记 E_ALLOC_MISMATCH', () => {
    const bad = makeSell({
      ...SELL_B,
      uuid: 'bad-sum',
      allocations: [{ lotId: 'lot-b3', quantity: 200_000 }],
    });
    const r = replay([...BUYS, bad], CONFIG);
    expect(r.anomalies[0].code).toBe('E_ALLOC_MISMATCH');
    expect(r.realizedPnl).toBe(0);
  });

  test('单批超量标记 E_ALLOC_EXCEED', () => {
    const bad = makeSell({
      ...SELL_B,
      uuid: 'bad-exceed',
      qty: 350_000,
      allocations: [{ lotId: 'lot-b3', quantity: 350_000 }],
    });
    const r = replay([...BUYS, bad], CONFIG);
    expect(r.anomalies[0].code).toBe('E_ALLOC_EXCEED');
  });

  test('数量为零标记 E_ZERO_QTY', () => {
    const zero = makeSell({ ...SELL_A, uuid: 'zero', qty: 0 });
    const r = replay([...BUYS, zero], CONFIG);
    expect(r.anomalies[0].code).toBe('E_ZERO_QTY');
  });

  test('存在异常时其余交易仍正常计算', () => {
    const over = makeSell({ ...SELL_A, uuid: 'over2', qty: 2_000_000 });
    const ok = makeSell({ ...SELL_A, uuid: 'ok', qty: 100_000 });
    const r = replay([...BUYS, over, ok], CONFIG);
    expect(r.anomalies).toHaveLength(1);
    expect(r.sells).toHaveLength(1);
    expect(r.sells[0].uuid).toBe('ok');
  });
});

describe('重放 · 编辑与删除的幂等性', () => {
  test('修改卖出价格后盈亏重算，批次剩余量不变', () => {
    const base = replay([...BUYS, makeSell(SELL_A)], CONFIG);
    const edited = replay(
      [...BUYS, makeSell({ ...SELL_A, priceLi: 52_000, uuid: 'sell-a' })],
      CONFIG
    );
    expect(lot(edited, 'lot-b3').remainQuantity).toBe(lot(base, 'lot-b3').remainQuantity);
    expect(edited.realizedPnl).toBe(base.realizedPnl);

    const cheaper = replay([...BUYS, makeSell({ ...SELL_A, priceLi: 45_000 })], CONFIG);
    expect(cheaper.realizedPnl).toBeLessThan(base.realizedPnl);
  });

  test('删除卖出后批次剩余量自动恢复（不依赖增量修补）', () => {
    const withSell = replay([...BUYS, makeSell(SELL_B)], CONFIG);
    const withoutSell = replay(BUYS, CONFIG);
    expect(lot(withSell, 'lot-b3').remainQuantity).toBe(100_000);
    expect(lot(withoutSell, 'lot-b3').remainQuantity).toBe(300_000);
    expect(withoutSell.realizedPnl).toBe(0);
  });

  test('重复重放结果稳定', () => {
    const txs = [...BUYS, makeSell(SELL_B)];
    const a = replay(txs, CONFIG);
    const b = replay(txs, CONFIG);
    expect(a).toEqual(b);
  });
});

describe('重放 · FIFO 路径', () => {
  test('先进先出按买入时间扣减', () => {
    const fifo = makeSell({ ...SELL_A, uuid: 'fifo', method: 'auto_fifo', qty: 300_000 });
    const r = replay([...BUYS, fifo], CONFIG);
    expect(r.anomalies).toHaveLength(0);
    // 先卖光 b1（200 股），再从 b2 取 100 股
    expect(lot(r, 'lot-b1').status).toBe('closed');
    expect(lot(r, 'lot-b2').remainQuantity).toBe(400_000);
    expect(lot(r, 'lot-b3').remainQuantity).toBe(300_000);
  });
});

describe('重放 · 空输入', () => {
  test('没有交易时输出空结果', () => {
    const r = replay([], CONFIG);
    expect(r.positions).toHaveLength(0);
    expect(r.lots).toHaveLength(0);
    expect(r.realizedPnl).toBe(0);
  });
});
