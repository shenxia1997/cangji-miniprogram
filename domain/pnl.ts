/**
 * 成本结转与盈亏计算。
 * 口径约定：成本基数已包含买入费用，因此已实现盈亏只有三项。
 */

/**
 * 加权平均结转成本。
 * 除法只在这里出现，且结果取整；调用方必须用「总额 - 结转」求剩余，禁止二次除法。
 */
export function weightedCostOut(totalCost: number, totalQty: number, sellQty: number): number {
  if (sellQty <= 0) return 0;
  if (totalQty <= 0) return 0;
  if (sellQty >= totalQty) return totalCost;
  return Math.round((totalCost * sellQty) / totalQty);
}

/** 已实现盈亏 = 卖出成交额 - 结转成本 - 卖出费用 */
export function realizedPnl(amount: number, costOut: number, feeTotal: number): number {
  return amount - costOut - feeTotal;
}

/**
 * 把总额按权重拆成整数数组，且保证各项之和精确等于总额。
 * 用于「按比例分摊」——避免逐项四舍五入导致总额漂移 1 分。
 */
export function largestRemainder(total: number, weights: number[]): number[] {
  const n = weights.length;
  const out = new Array<number>(n).fill(0);
  if (n === 0 || total === 0) return out;

  const sumWeight = weights.reduce((a, b) => a + b, 0);
  if (sumWeight <= 0) return out;

  const raw = weights.map((w) => (total * w) / sumWeight);
  for (let i = 0; i < n; i++) out[i] = Math.floor(raw[i]);

  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => (b.frac - a.frac) || (a.i - b.i));

  let guard = 0;
  while (rest > 0 && guard < n * 2) {
    let progressed = false;
    for (const item of order) {
      if (rest <= 0) break;
      const i = item.i;
      if (out[i] < weights[i]) {
        out[i] += 1;
        rest -= 1;
        progressed = true;
      }
    }
    if (!progressed) break;
    guard += 1;
  }
  return out;
}
