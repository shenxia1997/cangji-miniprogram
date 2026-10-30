import { replay } from '../domain/replay';
import type { Transaction } from '../domain/types';
import type { Snapshot } from './types';

/** 由交易数组计算快照 —— 全量重放，不做增量更新 */
export function computeSnapshot(txs: Transaction[], prices: Record<string, { lastPrice: number; priceUpdatedAt: number }>): Snapshot {
  const result = replay(txs, { defaultMethod: 'weighted', prices });
  const dataVersion = txs.reduce((a, t) => Math.max(a, t.updatedAt), 0);
  return {
    dataVersion,
    positions: result.positions,
    lots: result.lots,
    realizedPnl: result.realizedPnl,
    computedAt: Date.now(),
  };
}

/** 快照是否仍然有效：版本号一致才复用 */
export function isFresh(snapshot: Snapshot | null, dataVersion: number): boolean {
  return !!snapshot && snapshot.dataVersion === dataVersion;
}

/** 数据版本号：取所有交易 updatedAt 的最大值，写入即自增语义 */
export function dataVersionOf(txs: Transaction[]): number {
  return txs.reduce((a, t) => Math.max(a, t.updatedAt), 0);
}
