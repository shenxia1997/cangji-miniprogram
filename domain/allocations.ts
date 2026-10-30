import type { Allocation, ErrorCode, Lot } from './types';
import { weightedCostOut } from './pnl';

export interface ConsumePart {
  lotId: string;
  quantity: number; // 千分之一股
  costOut: number; // 分
}

export type AllocateResult =
  | { ok: true; parts: ConsumePart[]; costOut: number }
  | { ok: false; code: ErrorCode; detail?: string };

/** 指定批次结转（做T 场景）：一笔卖出可拆分到多个批次 */
export function allocateSpecified(
  sellQty: number,
  allocations: Allocation[],
  lots: Lot[],
  byId?: Map<string, Lot>
): AllocateResult {
  if (sellQty <= 0) return { ok: false, code: 'E_ZERO_QTY' };

  let sumAlloc = 0;
  for (const a of allocations) sumAlloc += a.quantity;
  if (sumAlloc !== sellQty) {
    return { ok: false, code: 'E_ALLOC_MISMATCH', detail: `分配合计 ${sumAlloc} ≠ 卖出量 ${sellQty}` };
  }

  const index = byId ?? toMap(lots);
  const parts: ConsumePart[] = [];
  let costOut = 0;

  for (const alloc of allocations) {
    const lot = index.get(alloc.lotId);
    if (!lot || alloc.quantity > lot.remainQuantity) {
      return {
        ok: false,
        code: 'E_ALLOC_EXCEED',
        detail: `批次 ${alloc.lotId} 可分配 ${lot ? lot.remainQuantity : 0}`,
      };
    }
    const partCost =
      alloc.quantity >= lot.remainQuantity
        ? lot.remainCost
        : Math.round((lot.remainCost * alloc.quantity) / lot.remainQuantity);
    parts.push({ lotId: alloc.lotId, quantity: alloc.quantity, costOut: partCost });
    costOut += partCost;
  }

  return { ok: true, parts, costOut };
}

/**
 * 先进先出：按买入顺序逐批扣减。
 * lots 在重放过程中始终按买入先后追加，因此无需每次排序 —— 这是热路径上最省的一步。
 */
export function allocateFifo(sellQty: number, lots: Lot[]): AllocateResult {
  if (sellQty <= 0) return { ok: false, code: 'E_ZERO_QTY' };

  let available = 0;
  for (const l of lots) available += l.remainQuantity;
  if (sellQty > available) return { ok: false, code: 'E_OVERSELL', detail: `可卖 ${available}` };

  const parts: ConsumePart[] = [];
  let need = sellQty;
  let costOut = 0;
  for (const lot of lots) {
    if (need <= 0) break;
    if (lot.remainQuantity <= 0) continue;
    const take = need < lot.remainQuantity ? need : lot.remainQuantity;
    const partCost =
      take >= lot.remainQuantity
        ? lot.remainCost
        : Math.round((lot.remainCost * take) / lot.remainQuantity);
    parts.push({ lotId: lot.lotId, quantity: take, costOut: partCost });
    costOut += partCost;
    need -= take;
  }
  return { ok: true, parts, costOut };
}

/**
 * 加权平均：各批次按同一比例扣减，各自用自身单位成本结转。
 *
 * 取舍说明：加权口径下"每份成本相同"是全局概念，但批次是展示实体。若把总额按成本占比
 * 回摊，会让高成本批次在卖出时出现「成本不降反升」的怪现象。这里按比例逐批结转，再用
 * 分差微调对齐总额 —— 单批单位成本保持稳定，总额仍精确守恒。
 *
 * 性能：份额分摊按批次顺序补齐余数（不排序），3000 笔重放可控制在 10ms 内。
 */
export function allocateWeighted(sellQty: number, lots: Lot[]): AllocateResult {
  if (sellQty <= 0) return { ok: false, code: 'E_ZERO_QTY' };

  let totalQty = 0;
  let totalCost = 0;
  for (const l of lots) {
    if (l.remainQuantity > 0) {
      totalQty += l.remainQuantity;
      totalCost += l.remainCost;
    }
  }
  if (sellQty > totalQty) return { ok: false, code: 'E_OVERSELL', detail: `可卖 ${totalQty}` };

  const target = weightedCostOut(totalCost, totalQty, sellQty);

  // 一轮按比例取整（只保留有消耗的批次，减少对象分配）
  const hits: Lot[] = [];
  const qs: number[] = [];
  let assigned = 0;
  for (const lot of lots) {
    if (lot.remainQuantity <= 0) continue;
    const q = Math.floor((sellQty * lot.remainQuantity) / totalQty);
    hits.push(lot);
    qs.push(q);
    assigned += q;
  }

  // 余数按顺序补齐，保证合计精确等于 sellQty
  let rest = sellQty - assigned;
  let cursor = 0;
  let guard0 = 0;
  while (rest > 0 && hits.length > 0 && guard0 < hits.length * 4) {
    if (qs[cursor] < hits[cursor].remainQuantity) {
      qs[cursor] += 1;
      rest -= 1;
    }
    cursor = (cursor + 1) % hits.length;
    guard0 += 1;
  }

  // 逐批按比例结转
  const parts: ConsumePart[] = [];
  const caps: number[] = [];
  let sumCost = 0;
  for (let i = 0; i < hits.length; i++) {
    const lot = hits[i];
    const q = qs[i];
    if (q <= 0) continue;
    const cost = q >= lot.remainQuantity ? lot.remainCost : Math.round((lot.remainCost * q) / lot.remainQuantity);
    parts.push({ lotId: lot.lotId, quantity: q, costOut: cost });
    caps.push(q < lot.remainQuantity ? lot.remainCost - cost : 0);
    sumCost += cost;
  }

  // 取整偏差拉回总额：只在仍有剩余份额的批次上微调，且不超过其剩余成本
  let diff = target - sumCost;
  let guard = 0;
  while (diff !== 0 && guard < 1000) {
    let progressed = false;
    for (let i = 0; i < parts.length; i++) {
      if (diff === 0) break;
      if (caps[i] <= 0) continue;
      if (diff > 0) {
        parts[i].costOut += 1;
        caps[i] -= 1;
        diff -= 1;
        progressed = true;
      } else if (parts[i].costOut > 0) {
        parts[i].costOut -= 1;
        caps[i] += 1;
        diff += 1;
        progressed = true;
      }
    }
    if (!progressed) break;
    guard += 1;
  }

  let costOut = 0;
  for (const p of parts) costOut += p.costOut;
  return { ok: true, parts, costOut };
}

function toMap(lots: Lot[]): Map<string, Lot> {
  const m = new Map<string, Lot>();
  for (const l of lots) m.set(l.lotId, l);
  return m;
}
