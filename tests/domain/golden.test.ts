/**
 * 金标准测试 —— 期望值全部来自 tests/fixtures/golden.ts，误差必须为 0 分。
 */
import { replay } from '../../domain/replay';
import { unitPriceLi } from '../../domain/money';
import {
  BUYS,
  CONFIG,
  EXPECT,
  INSTRUMENT,
  SELL_A,
  SELL_B,
  SELL_C,
  makeSell,
} from '../fixtures/golden';

const positionOf = (result: ReturnType<typeof replay>) =>
  result.positions.find((p) => p.instrumentId === INSTRUMENT);

const lotOf = (result: ReturnType<typeof replay>, lotId: string) =>
  result.lots.find((l) => l.lotId === lotId);

describe('金标准 · 初始持仓', () => {
  test('三笔买入的成本总额与均价', () => {
    const r = replay(BUYS, CONFIG);
    const pos = positionOf(r);
    expect(pos).toBeDefined();
    expect(pos!.quantity).toBe(EXPECT.initial.quantity);
    expect(pos!.costTotal).toBe(EXPECT.initial.costTotal);
    expect(unitPriceLi(pos!.costTotal, pos!.quantity)).toBe(EXPECT.initial.unitPriceLi);

    expect(lotOf(r, 'lot-b1')!.costTotal).toBe(EXPECT.initial.buyCosts['lot-b1']);
    expect(lotOf(r, 'lot-b2')!.costTotal).toBe(EXPECT.initial.buyCosts['lot-b2']);
    expect(lotOf(r, 'lot-b3')!.costTotal).toBe(EXPECT.initial.buyCosts['lot-b3']);
  });

  test('买入不产生已实现盈亏', () => {
    const r = replay(BUYS, CONFIG);
    expect(r.realizedPnl).toBe(0);
    expect(r.sells).toHaveLength(0);
    expect(r.anomalies).toHaveLength(0);
  });
});

describe('金标准 · 情形 A 加权卖出', () => {
  const txs = [...BUYS, makeSell(SELL_A)];
  const r = replay(txs, CONFIG);

  test('结转成本与已实现盈亏', () => {
    expect(r.sells).toHaveLength(1);
    const sell = r.sells[0];
    expect(sell.amount).toBe(EXPECT.caseA.sellAmount);
    expect(sell.costOut).toBe(EXPECT.caseA.costOut);
    expect(sell.pnl).toBe(EXPECT.caseA.pnl);
    expect(r.realizedPnl).toBe(EXPECT.caseA.pnl);
  });

  test('剩余持仓成本与均价不变', () => {
    const pos = positionOf(r)!;
    expect(pos.quantity).toBe(EXPECT.caseA.remainQty);
    expect(pos.costTotal).toBe(EXPECT.caseA.remainCost);
    expect(unitPriceLi(pos.costTotal, pos.quantity)).toBe(EXPECT.caseA.remainUnitPriceLi);
  });

  test('加权口径下各批次单价保持一致', () => {
    expect(unitPriceLi(lotOf(r, 'lot-b1')!.remainCost, lotOf(r, 'lot-b1')!.remainQuantity)).toBe(51_825);
    expect(lotOf(r, 'lot-b1')!.remainQuantity).toBe(140_000);
  });
});

describe('金标准 · 情形 B 指定批次卖出', () => {
  const txs = [...BUYS, makeSell(SELL_B)];
  const r = replay(txs, CONFIG);

  test('逐批结转明细', () => {
    const sell = r.sells[0];
    expect(sell.costOut).toBe(EXPECT.caseB.costOut);
    expect(lotOf(r, 'lot-b3')!.remainCost).toBe(EXPECT.caseB.b3.cost);
    expect(lotOf(r, 'lot-b2')!.remainCost).toBe(EXPECT.caseB.b2.cost);
  });

  test('已实现盈亏按指定批次计算，高于加权口径', () => {
    expect(r.sells[0].pnl).toBe(EXPECT.caseB.pnl);
    expect(EXPECT.caseB.pnl).toBeGreaterThan(EXPECT.caseA.pnl);
  });

  test('剩余成本上升 —— 卖掉低成本批次的必然副作用', () => {
    const pos = positionOf(r)!;
    expect(pos.quantity).toBe(EXPECT.caseB.remainQty);
    expect(pos.costTotal).toBe(EXPECT.caseB.remainCost);
    expect(unitPriceLi(pos.costTotal, pos.quantity)).toBe(EXPECT.caseB.remainUnitPriceLi);
    expect(EXPECT.caseB.remainUnitPriceLi).toBeGreaterThan(EXPECT.initial.unitPriceLi);
  });

  test('批次剩余量与状态', () => {
    const b3 = lotOf(r, 'lot-b3')!;
    const b2 = lotOf(r, 'lot-b2')!;
    expect(b3.remainQuantity).toBe(EXPECT.caseB.b3.qty);
    expect(b3.status).toBe(EXPECT.caseB.b3.status);
    expect(b2.remainQuantity).toBe(EXPECT.caseB.b2.qty);
    expect(b2.status).toBe(EXPECT.caseB.b2.status);
    expect(lotOf(r, 'lot-b1')!.status).toBe('holding');
  });

  test('卖出记录保留实际消耗的批次', () => {
    expect(r.sells[0].allocations).toEqual([
      { lotId: 'lot-b3', quantity: 200_000 },
      { lotId: 'lot-b2', quantity: 100_000 },
    ]);
  });
});

describe('金标准 · 情形 C 拆分卖出', () => {
  const txs = [...BUYS, makeSell(SELL_C)];
  const r = replay(txs, CONFIG);

  test('多批次拆分合计', () => {
    const sell = r.sells[0];
    expect(sell.amount).toBe(EXPECT.caseC.sellAmount);
    expect(sell.costOut).toBe(EXPECT.caseC.costOut);
    expect(sell.pnl).toBe(EXPECT.caseC.pnl);
  });

  test('全清批次状态为 closed', () => {
    expect(lotOf(r, 'lot-b3')!.status).toBe(EXPECT.caseC.b3Status);
    expect(lotOf(r, 'lot-b3')!.remainQuantity).toBe(0);
    expect(lotOf(r, 'lot-b3')!.remainCost).toBe(0);
  });

  test('剩余持仓', () => {
    const pos = positionOf(r)!;
    expect(pos.quantity).toBe(EXPECT.caseC.remainQty);
    expect(pos.costTotal).toBe(EXPECT.caseC.remainCost);
  });
});

describe('金标准 · 恒等式', () => {
  const cases = [SELL_A, SELL_B, SELL_C];

  test.each(cases)('$uuid：批次守恒与成本守恒', (spec) => {
    const txs = [...BUYS, makeSell(spec)];
    const r = replay(txs, CONFIG);
    const pos = positionOf(r)!;

    const lotQty = r.lots.reduce((a, l) => a + l.remainQuantity, 0);
    const lotCost = r.lots.reduce((a, l) => a + l.remainCost, 0);
    const costOut = r.sells.reduce((a, s) => a + s.costOut, 0);

    expect(lotQty).toBe(pos.quantity);
    expect(lotCost).toBe(pos.costTotal);
    expect(costOut + lotCost).toBe(EXPECT.initial.costTotal);

    const sellAmount = r.sells.reduce((a, s) => a + s.amount, 0);
    const sellFee = r.sells.reduce((a, s) => a + s.feeTotal, 0);
    expect(r.realizedPnl).toBe(sellAmount - costOut - sellFee);
  });
});

describe('金标准 · 费用汇总', () => {
  test('买卖费用合计', () => {
    const r = replay([...BUYS, makeSell(SELL_A)], CONFIG);
    expect(r.feeTotal).toBe(500 * 3 + 3_060);
  });
});
