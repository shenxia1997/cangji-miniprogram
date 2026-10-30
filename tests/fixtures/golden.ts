/**
 * 金标准夹具 —— 全项目唯一的期望值来源。
 * 三笔买入：200@51.80 / 500@48.20 / 300@46.90，每笔费用 5.00 元。
 */
import type { Transaction } from '../../domain/types';
import { mulPriceQty, yuanToCents } from '../../domain/money';

const DAY = 24 * 3600 * 1000;
export const T0 = 1_730_000_000_000;

interface BuySpec {
  uuid: string;
  qty: number; // 千分之一股
  priceLi: number;
  feeCents: number;
  at: number;
}

export const BUY_SPECS: BuySpec[] = [
  { uuid: 'lot-b1', qty: 200_000, priceLi: 51_800, feeCents: 500, at: T0 },
  { uuid: 'lot-b2', qty: 500_000, priceLi: 48_200, feeCents: 500, at: T0 + DAY },
  { uuid: 'lot-b3', qty: 300_000, priceLi: 46_900, feeCents: 500, at: T0 + 2 * DAY },
];

export const INSTRUMENT = 'inst-600519';
export const ACCOUNT = 'acc-1';

export function makeBuy(spec: BuySpec): Transaction {
  return {
    uuid: spec.uuid,
    instrumentId: INSTRUMENT,
    accountId: ACCOUNT,
    direction: 'buy',
    price: spec.priceLi,
    quantity: spec.qty,
    amount: mulPriceQty(spec.priceLi, spec.qty),
    feeItems: [{ type: 'commission', amount: spec.feeCents }],
    feeTotal: spec.feeCents,
    method: 'auto_weighted',
    allocations: [],
    tradedAt: spec.at,
    createdAt: spec.at,
    rev: 1,
    deletedAt: 0,
    updatedAt: spec.at,
  };
}

export const BUYS: Transaction[] = BUY_SPECS.map(makeBuy);

export interface SellSpec {
  uuid: string;
  qty: number;
  priceLi: number;
  feeCents: number;
  at: number;
  method: Transaction['method'];
  allocations?: Array<{ lotId: string; quantity: number }>;
  rev?: number;
}

export function makeSell(spec: SellSpec): Transaction {
  return {
    uuid: spec.uuid,
    instrumentId: INSTRUMENT,
    accountId: ACCOUNT,
    direction: 'sell',
    price: spec.priceLi,
    quantity: spec.qty,
    amount: mulPriceQty(spec.priceLi, spec.qty),
    feeItems: [
      { type: 'commission', amount: 500 },
      { type: 'stamp', amount: spec.feeCents - 500 },
    ],
    feeTotal: spec.feeCents,
    method: spec.method,
    allocations: spec.allocations ?? [],
    tradedAt: spec.at,
    createdAt: spec.at,
    rev: spec.rev ?? 1,
    deletedAt: 0,
    updatedAt: spec.at,
  };
}

/** 情形 A：加权卖出 300 股 @52.00，费用 30.60 */
export const SELL_A: SellSpec = {
  uuid: 'sell-a',
  qty: 300_000,
  priceLi: 52_000,
  feeCents: 3_060,
  at: T0 + 3 * DAY,
  method: 'auto_weighted',
};

/** 情形 B：指定批次卖出 300 股 @52.00（B3 200 + B2 100） */
export const SELL_B: SellSpec = {
  uuid: 'sell-b',
  qty: 300_000,
  priceLi: 52_000,
  feeCents: 3_060,
  at: T0 + 3 * DAY,
  method: 'specified',
  allocations: [
    { lotId: 'lot-b3', quantity: 200_000 },
    { lotId: 'lot-b2', quantity: 100_000 },
  ],
};

/** 情形 C：拆分卖出 500 股 @50.00（B3 全清 300 + B2 200） */
export const SELL_C: SellSpec = {
  uuid: 'sell-c',
  qty: 500_000,
  priceLi: 50_000,
  feeCents: 3_000,
  at: T0 + 3 * DAY,
  method: 'specified',
  allocations: [
    { lotId: 'lot-b3', quantity: 300_000 },
    { lotId: 'lot-b2', quantity: 200_000 },
  ],
};

export const EXPECT = {
  initial: {
    quantity: 1_000_000,
    costTotal: 4_854_500,
    unitPriceLi: 48_545,
    buyCosts: { 'lot-b1': 1_036_500, 'lot-b2': 2_410_500, 'lot-b3': 1_407_500 },
  },
  caseA: {
    sellAmount: 1_560_000,
    costOut: 1_456_350,
    pnl: 100_590,
    remainCost: 3_398_150,
    remainQty: 700_000,
    remainUnitPriceLi: 48_545,
  },
  caseB: {
    costOutB3: 938_333,
    costOutB2: 482_100,
    costOut: 1_420_433,
    pnl: 136_507,
    remainCost: 3_434_067,
    remainQty: 700_000,
    remainUnitPriceLi: 49_058,
    b3: { qty: 100_000, cost: 469_167, status: 'partial' as const },
    b2: { qty: 400_000, cost: 1_928_400, status: 'partial' as const },
  },
  caseC: {
    sellAmount: 2_500_000,
    costOut: 2_371_700,
    pnl: 125_300,
    remainCost: 2_482_800,
    remainQty: 500_000,
    b3Status: 'closed' as const,
  },
  fees: { commission: 500, stamp: 2_560 },
};

/** 价格配置：最新价 52.00 */
export const PRICES = {
  [INSTRUMENT]: { lastPrice: 52_000, priceUpdatedAt: T0 + 3 * DAY },
};

export const CONFIG = { defaultMethod: 'weighted' as const, prices: PRICES };

/** 便捷：三笔买入的总额 */
export const INITIAL_COST = EXPECT.initial.costTotal;

/** 元字符串→分，测试里手写期望值时使用，避免浮点 */
export const yuan = yuanToCents;
