import type { Lot, LotStatus, Transaction } from './types';
import { unitPriceLi } from './money';

/**
 * 由买入交易派生批次。
 * lotId 直接使用买入交易 uuid —— 删除中间一笔买入后，历史卖出的引用依然有效。
 */
export function createLotFromBuy(tx: Transaction): Lot {
  if (tx.direction !== 'buy') {
    throw new Error('createLotFromBuy 只接受买入交易');
  }
  const costTotal = tx.amount + tx.feeTotal;
  return {
    lotId: tx.uuid,
    instrumentId: tx.instrumentId,
    openedAt: tx.tradedAt,
    unitPrice: tx.price,
    quantity: tx.quantity,
    remainQuantity: tx.quantity,
    costTotal,
    remainCost: costTotal,
    realizedPnl: 0,
    status: 'holding',
  };
}

/** 状态完全由剩余量派生，不独立存储 */
export function deriveStatus(lot: Lot): LotStatus {
  if (lot.remainQuantity <= 0) return 'closed';
  if (lot.remainQuantity >= lot.quantity) return 'holding';
  return 'partial';
}

/** 扣减批次，返回新对象（不修改入参，便于属性测试比对） */
export function consumeLot(lot: Lot, usedQty: number, usedCost: number, pnl: number): Lot {
  const next: Lot = {
    ...lot,
    remainQuantity: lot.remainQuantity - usedQty,
    remainCost: lot.remainCost - usedCost,
    realizedPnl: lot.realizedPnl + pnl,
  };
  next.status = deriveStatus(next);
  return next;
}

/** 批次当前的展示单价（厘），仅用于界面 */
export function lotUnitPrice(lot: Lot): number {
  return unitPriceLi(lot.remainCost, lot.remainQuantity) || lot.unitPrice;
}
