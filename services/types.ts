import type { Lot, Position, Transaction } from '../domain/types';
import type { RangeStats } from '../domain/stats';

export interface Account {
  id: string;
  name: string;
  feeTemplate: {
    commissionRate: number; // 万分之几，整数
    minCommission: number; // 分
    stampRate: number; // 千分之几，整数
  };
}

export interface Instrument {
  id: string;
  code: string;
  name: string;
  type: 'stock' | 'fund';
  market: 'sh' | 'sz' | 'bj' | 'fund';
  lastPrice: number; // 厘
  priceUpdatedAt: number;
  starred: boolean;
}

export interface AppConfig {
  dataVersion: number;
  accounts: Account[];
  instruments: Instrument[];
  defaultMethod: 'weighted' | 'fifo';
  currentAccountId: string;
}

export interface Snapshot {
  dataVersion: number;
  positions: Position[];
  lots: Lot[];
  realizedPnl: number;
  stats?: RangeStats;
  computedAt: number;
}

export interface SyncTask {
  uuid: string;
  attempts: number;
  nextAt: number;
}

export const DEFAULT_CONFIG: AppConfig = {
  dataVersion: 0,
  accounts: [
    {
      id: 'acc-default',
      name: '默认账户',
      feeTemplate: { commissionRate: 2.5, minCommission: 500, stampRate: 1 },
    },
  ],
  instruments: [],
  defaultMethod: 'weighted',
  currentAccountId: 'acc-default',
};

export type { Transaction, Lot, Position };
