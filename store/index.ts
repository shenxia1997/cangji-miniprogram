import { replay } from '../domain/replay';
import type { Lot, Position, Transaction } from '../domain/types';
import type { Snapshot } from '../services/types';

type Listener = (state: AppState) => void;

export interface AppState {
  ready: boolean;
  snapshot: Snapshot | null;
  positions: Position[];
  lots: Lot[];
  realizedPnl: number;
  transactions: Transaction[];
}

const initialState: AppState = {
  ready: false,
  snapshot: null,
  positions: [],
  lots: [],
  realizedPnl: 0,
  transactions: [],
};

/**
 * 轻量 observable：不引入状态库。
 * 数据流单向：动作 → services 写库 → 版本自增 → 重放 → 订阅者刷新。
 */
class Store {
  private state: AppState = initialState;
  private listeners: Listener[] = [];

  get(): AppState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  /** 用一组交易重建状态：快照命中则直接复用，否则全量重放 */
  hydrate(
    txs: Transaction[],
    prices: Record<string, { lastPrice: number; priceUpdatedAt: number }>,
    cached?: Snapshot | null
  ): void {
    const version = txs.reduce((a, t) => Math.max(a, t.updatedAt), 0);
    if (cached && cached.dataVersion === version) {
      this.set({ ready: true, snapshot: cached, positions: cached.positions, lots: cached.lots, realizedPnl: cached.realizedPnl, transactions: txs });
      return;
    }
    const result = replay(txs, { defaultMethod: 'weighted', prices });
    const snapshot: Snapshot = {
      dataVersion: version,
      positions: result.positions,
      lots: result.lots,
      realizedPnl: result.realizedPnl,
      computedAt: Date.now(),
    };
    this.set({
      ready: true,
      snapshot,
      positions: result.positions,
      lots: result.lots,
      realizedPnl: result.realizedPnl,
      transactions: txs,
    });
  }

  positionOf(instrumentId: string): Position | undefined {
    return this.state.positions.find((p) => p.instrumentId === instrumentId);
  }

  lotsOf(instrumentId: string): Lot[] {
    return this.state.lots.filter((l) => l.instrumentId === instrumentId && l.remainQuantity > 0);
  }

  private set(next: AppState): void {
    this.state = next;
    for (const fn of this.listeners) fn(next);
  }
}

export const store = new Store();
export type { Snapshot };
