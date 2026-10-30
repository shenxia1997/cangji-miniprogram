/**
 * 领域层类型定义 —— 契约文件，字段名不得改动。
 * 单位约定：价格=厘（元×1000），数量=千分之一股，金额/成本/盈亏=分（元×100）
 */

export type Direction = 'buy' | 'sell';
export type SettleMethod = 'auto_weighted' | 'auto_fifo' | 'specified';
export type LotStatus = 'holding' | 'partial' | 'closed';
export type FeeType = 'commission' | 'stamp' | 'transfer' | 'purchase' | 'redeem' | 'other';
export type InstrumentType = 'stock' | 'fund';

/** 异常码 —— 与 errors.ts 中的文案表配套 */
export type ErrorCode =
  | 'E_OVERSELL'
  | 'E_ALLOC_MISMATCH'
  | 'E_ALLOC_EXCEED'
  | 'E_NEGATIVE_COST'
  | 'E_ZERO_QTY';

export interface FeeItem {
  type: FeeType;
  amount: number; // 分
}

export interface Allocation {
  lotId: string;
  quantity: number; // 千分之一股
}

export interface Transaction {
  uuid: string; // 客户端生成，幂等键；买入时同时作为 lotId
  instrumentId: string;
  accountId: string;
  direction: Direction;
  price: number; // 厘
  quantity: number; // 千分之一股
  amount: number; // 分，= round(price * quantity / 10000)
  feeItems: FeeItem[];
  feeTotal: number; // 分
  method: SettleMethod;
  allocations: Allocation[];
  tradedAt: number; // 毫秒时间戳（第一排序键）
  createdAt: number; // 毫秒时间戳（第二排序键）
  note?: string;
  rev: number;
  deletedAt: number; // 0 = 未删除
  updatedAt: number;
}

export interface Lot {
  lotId: string; // = 买入交易 uuid
  instrumentId: string;
  openedAt: number;
  unitPrice: number; // 厘，仅展示
  quantity: number; // 千分之一股，原始量
  remainQuantity: number; // 千分之一股
  costTotal: number; // 分，含买入费用
  remainCost: number; // 分
  realizedPnl: number; // 分，该批次累计已实现
  status: LotStatus;
}

export interface Position {
  instrumentId: string;
  quantity: number; // 千分之一股
  costTotal: number; // 分
  lastPrice: number; // 厘，用户手动维护
  priceUpdatedAt: number;
  marketValue: number; // 分
  unrealizedPnl: number; // 分
}

export interface Anomaly {
  uuid: string;
  code: ErrorCode;
  detail?: string;
}

/** 单笔卖出的结转结果 —— 供统计与流水展示使用（对契约的增量字段） */
export interface SellResult {
  uuid: string;
  tradedAt: number;
  instrumentId: string;
  amount: number; // 卖出成交额（分）
  costOut: number; // 结转成本合计（分）
  feeTotal: number; // 卖出费用（分）
  pnl: number; // 已实现盈亏（分）
  allocations: Allocation[]; // 实际消耗的批次
}

export interface ReplayResult {
  positions: Position[];
  lots: Lot[];
  realizedPnl: number; // 分
  feeTotal: number; // 分
  anomalies: Anomaly[];
  sells: SellResult[]; // 增量字段：逐笔卖出结果
}

export interface PriceConfig {
  lastPrice: number; // 厘
  priceUpdatedAt: number;
}

export interface ReplayConfig {
  defaultMethod: 'weighted' | 'fifo';
  prices: Record<string, PriceConfig>;
}
