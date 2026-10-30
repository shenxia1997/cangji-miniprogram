import type { ReplayResult, SellResult, Transaction } from './types';

export interface RangeStats {
  from: number;
  to: number;
  buyAmount: number; // 分
  sellAmount: number; // 分
  feeTotal: number; // 分
  realizedPnl: number; // 分
  tradeCount: number;
}

export interface RankingItem {
  instrumentId: string;
  realizedPnl: number;
  unrealizedPnl: number;
  marketValue: number;
}

/** 区间统计：买入额、卖出额、费用、已实现盈亏 */
export function rangeStats(
  txns: Transaction[],
  result: ReplayResult,
  from: number,
  to: number
): RangeStats {
  let buyAmount = 0;
  let sellAmount = 0;
  let feeTotal = 0;
  let tradeCount = 0;

  for (const tx of txns) {
    if (tx.deletedAt) continue;
    if (tx.tradedAt < from || tx.tradedAt > to) continue;
    tradeCount += 1;
    feeTotal += tx.feeTotal;
    if (tx.direction === 'buy') buyAmount += tx.amount;
    else sellAmount += tx.amount;
  }

  const realizedPnl = result.sells
    .filter((s: SellResult) => s.tradedAt >= from && s.tradedAt <= to)
    .reduce((a, s) => a + s.pnl, 0);

  return { from, to, buyAmount, sellAmount, feeTotal, realizedPnl, tradeCount };
}

/** 标的排行：已实现盈亏取自逐笔卖出结果，浮动盈亏取自持仓 */
export function ranking(result: ReplayResult): RankingItem[] {
  const map = new Map<string, RankingItem>();

  const ensure = (instrumentId: string): RankingItem => {
    let item = map.get(instrumentId);
    if (!item) {
      item = { instrumentId, realizedPnl: 0, unrealizedPnl: 0, marketValue: 0 };
      map.set(instrumentId, item);
    }
    return item;
  };

  for (const s of result.sells) {
    ensure(s.instrumentId).realizedPnl += s.pnl;
  }
  for (const p of result.positions) {
    const item = ensure(p.instrumentId);
    item.unrealizedPnl = p.unrealizedPnl;
    item.marketValue = p.marketValue;
  }

  return Array.from(map.values()).sort((a, b) => b.realizedPnl - a.realizedPnl);
}

/** 费用构成：按费用类型汇总 */
export function feeBreakdown(txns: Transaction[]): Array<{ type: string; amount: number }> {
  const map = new Map<string, number>();
  for (const tx of txns) {
    if (tx.deletedAt) continue;
    for (const fee of tx.feeItems) {
      map.set(fee.type, (map.get(fee.type) ?? 0) + fee.amount);
    }
  }
  return Array.from(map.entries())
    .map(([type, amount]) => ({ type, amount }))
    .sort((a, b) => b.amount - a.amount);
}
