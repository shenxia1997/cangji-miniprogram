import { replay } from '../../domain/replay';
import { liToYuan, mulPriceQty, unitPriceLi } from '../../domain/money';
import type { Transaction } from '../../domain/types';

const T0 = Date.now() - 86_400_000 * 10;

function buy(uuid: string, qty: number, priceLi: number, fee: number, at: number): Transaction {
  return {
    uuid,
    instrumentId: 'demo',
    accountId: 'demo',
    direction: 'buy',
    price: priceLi,
    quantity: qty,
    amount: mulPriceQty(priceLi, qty),
    feeItems: [{ type: 'commission', amount: fee }],
    feeTotal: fee,
    method: 'auto_weighted',
    allocations: [],
    tradedAt: at,
    createdAt: at,
    rev: 1,
    deletedAt: 0,
    updatedAt: at,
  };
}

function sell(
  uuid: string,
  qty: number,
  priceLi: number,
  fee: number,
  at: number,
  allocations: Array<{ lotId: string; quantity: number }>
): Transaction {
  return {
    ...buy(uuid, qty, priceLi, fee, at),
    direction: 'sell',
    method: allocations.length > 0 ? 'specified' : 'auto_weighted',
    allocations,
  };
}

/** 页面里的示例数字全部由引擎实时算出，不硬编码结果 */
Page({
  data: {
    buys: [] as Array<{ label: string; text: string }>,
    totalQty: '',
    totalCost: '',
    avgPrice: '',
    weightedPnl: 0,
    specifiedPnl: 0,
    weightedUnit: '',
    specifiedUnit: '',
  },

  onLoad() {
    const buys = [
      buy('b1', 200_000, 51_800, 500, T0),
      buy('b2', 500_000, 48_200, 500, T0 + 86_400_000),
      buy('b3', 300_000, 46_900, 500, T0 + 2 * 86_400_000),
    ];
    const sellAt = T0 + 3 * 86_400_000;
    const weighted = sell('s1', 300_000, 52_000, 3_060, sellAt, []);
    const specified = sell('s2', 300_000, 52_000, 3_060, sellAt, [
      { lotId: 'b3', quantity: 200_000 },
      { lotId: 'b2', quantity: 100_000 },
    ]);

    const rWeighted = replay([...buys, weighted], { defaultMethod: 'weighted', prices: {} });
    const rSpecified = replay([...buys, specified], { defaultMethod: 'weighted', prices: {} });

    const posW = rWeighted.positions.find((p) => p.instrumentId === 'demo');
    const posS = rSpecified.positions.find((p) => p.instrumentId === 'demo');
    const totalCostCents = buys.reduce((a, t) => a + t.amount + t.feeTotal, 0);

    this.setData({
      buys: [
        { label: '第 1 批', text: '200 股 @ 51.80' },
        { label: '第 2 批', text: '500 股 @ 48.20' },
        { label: '第 3 批', text: '300 股 @ 46.90' },
      ],
      totalQty: '1,000',
      totalCost: (totalCostCents / 100).toFixed(2),
      avgPrice: liToYuan(unitPriceLi(totalCostCents, 1_000_000), 3),
      weightedPnl: rWeighted.sells[0]?.pnl ?? 0,
      specifiedPnl: rSpecified.sells[0]?.pnl ?? 0,
      weightedUnit: posW ? liToYuan(unitPriceLi(posW.costTotal, posW.quantity), 3) : '-',
      specifiedUnit: posS ? liToYuan(unitPriceLi(posS.costTotal, posS.quantity), 3) : '-',
    });
  },

  goBack() {
    wx.navigateBack();
  },
});
