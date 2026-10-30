import type { ErrorCode } from './types';

export type { ErrorCode };

/** 异常码 → 面向用户的中文提示 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  E_OVERSELL: '卖出数量超过可用持仓，请检查该笔记录',
  E_ALLOC_MISMATCH: '批次分配合计与卖出数量不一致',
  E_ALLOC_EXCEED: '单批次分配数量超过该批次剩余',
  E_NEGATIVE_COST: '成本计算结果为负，数据异常',
  E_ZERO_QTY: '成交数量必须大于 0',
};

export function messageOf(code: ErrorCode): string {
  return ERROR_MESSAGES[code] ?? '数据异常';
}
