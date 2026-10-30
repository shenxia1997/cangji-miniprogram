import type {
  Anomaly,
  Lot,
  Position,
  ReplayConfig,
  ReplayResult,
  SellResult,
  Transaction,
} from './types';
import { allocateFifo, allocateSpecified, allocateWeighted, type AllocateResult, type ConsumePart } from './allocations';
import { realizedPnl as consumedPnl } from './pnl';
import { createLotFromBuy, deriveStatus } from './lots';
import { mulPriceQty } from './money';

/** 重放：输入全部交易，输出持仓、批次、逐笔盈亏。纯函数，无副作用。 */
export function replay(txns: Transaction[], config: ReplayConfig): ReplayResult {
  const active = txns.filter((t) => !t.deletedAt);

  // 排序必须确定：成交时间 → 创建时间 → uuid
  const sorted = active.slice().sort((a, b) => {
    if (a.tradedAt !== b.tradedAt) return a.tradedAt - b.tradedAt;
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.uuid.localeCompare(b.uuid);
  });

  const lotsByInstrument = new Map<string, Lot[]>();
  const lotIndex = new Map<string, Lot>();
  const anomalies: Anomaly[] = [];
  const sells: SellResult[] = [];
  let realizedTotal = 0;

  const getLots = (instrumentId: string): Lot[] => {
    let list = lotsByInstrument.get(instrumentId);
    if (!list) {
      list = [];
      lotsByInstrument.set(instrumentId, list);
    }
    return list;
  };

  for (const tx of sorted) {
    if (tx.quantity <= 0) {
      anomalies.push({ uuid: tx.uuid, code: 'E_ZERO_QTY' });
      continue;
    }

    const lots = getLots(tx.instrumentId);

    if (tx.direction === 'buy') {
      const lot = createLotFromBuy(tx);
      lots.push(lot);
      lotIndex.set(lot.lotId, lot);
      continue;
    }

    // ---- 卖出 ----
    const result = routeAllocation(tx, lots, lotIndex);
    if (!result.ok) {
      anomalies.push({
        uuid: tx.uuid,
        code: result.code,
        detail: result.detail,
      });
      continue;
    }

    const pnl = consumedPnl(tx.amount, result.costOut, tx.feeTotal);
    const pnlParts = splitSigned(pnl, result.parts.map((p) => p.costOut));

    applyConsumption(lots, result.parts, pnlParts, lotIndex);

    // 加权口径没有"卖的是哪一批"的语义，不产出批次归属，省掉一笔对象分配
    const allocations =
      tx.method === 'auto_weighted'
        ? []
        : result.parts.filter((p) => p.quantity > 0).map((p) => ({ lotId: p.lotId, quantity: p.quantity }));

    sells.push({
      uuid: tx.uuid,
      tradedAt: tx.tradedAt,
      instrumentId: tx.instrumentId,
      amount: tx.amount,
      costOut: result.costOut,
      feeTotal: tx.feeTotal,
      pnl,
      allocations,
    });
    realizedTotal += pnl;

    if (lots.some((l) => l.remainCost < 0)) {
      anomalies.push({ uuid: tx.uuid, code: 'E_NEGATIVE_COST' });
    }
  }

  const positions = buildPositions(lotsByInstrument, config);
  const allLots = Array.from(lotsByInstrument.values())
    .flat()
    .sort((a, b) => (a.openedAt - b.openedAt) || a.lotId.localeCompare(b.lotId));

  const feeTotal = active.reduce((acc, t) => acc + t.feeTotal, 0);

  return {
    positions,
    lots: allLots,
    realizedPnl: realizedTotal,
    feeTotal,
    anomalies,
    sells,
  };
}

function routeAllocation(tx: Transaction, lots: Lot[], index: Map<string, Lot>): AllocateResult {
  if (tx.method === 'specified' && tx.allocations.length > 0) {
    return allocateSpecified(tx.quantity, tx.allocations, lots, index);
  }
  if (tx.method === 'auto_fifo') {
    return allocateFifo(tx.quantity, lots);
  }
  return allocateWeighted(tx.quantity, lots);
}

/**
 * 把一笔盈亏按成本占比拆到各批次，保证合计精确等于原值（正负均可）。
 * 余数按顺序补齐而不是排序取最大小数 —— 少一次 O(n log n)，3000 笔重放才有意义。
 */
function splitSigned(total: number, weights: number[]): number[] {
  const n = weights.length;
  const out = new Array<number>(n).fill(0);
  if (n === 0 || total === 0) return out;

  let sumW = 0;
  for (const w of weights) sumW += w > 0 ? w : 0;
  if (sumW <= 0) return out;

  const abs = Math.abs(total);
  let assigned = 0;
  for (let i = 0; i < n; i++) {
    const w = weights[i] > 0 ? weights[i] : 0;
    const v = Math.floor((abs * w) / sumW);
    out[i] = v;
    assigned += v;
  }
  let rest = abs - assigned;
  for (let i = 0; rest > 0 && i < n * 4; i++) {
    out[i % n] += 1;
    rest -= 1;
  }

  if (total < 0) for (let i = 0; i < n; i++) out[i] = -out[i];
  return out;
}

function applyConsumption(lots: Lot[], parts: ConsumePart[], pnlParts: number[], byId?: Map<string, Lot>): void {
  const index = byId ?? new Map<string, Lot>(lots.map((l) => [l.lotId, l]));
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const lot = index.get(part.lotId);
    if (!lot) continue;
    // 原地扣减：lots 是本次重放的局部数据，不需要写时复制
    lot.remainQuantity -= part.quantity;
    lot.remainCost -= part.costOut;
    lot.realizedPnl += pnlParts[i] ?? 0;
    lot.status = deriveStatus(lot);
  }
}

function buildPositions(lotsByInstrument: Map<string, Lot[]>, config: ReplayConfig): Position[] {
  const positions: Position[] = [];
  lotsByInstrument.forEach((lots, instrumentId) => {
    const quantity = lots.reduce((a, l) => a + l.remainQuantity, 0);
    if (quantity <= 0) return;
    const costTotal = lots.reduce((a, l) => a + l.remainCost, 0);
    const price = config.prices[instrumentId];
    const lastPrice = price ? price.lastPrice : 0;
    const marketValue = mulPriceQty(lastPrice, quantity);
    positions.push({
      instrumentId,
      quantity,
      costTotal,
      lastPrice,
      priceUpdatedAt: price ? price.priceUpdatedAt : 0,
      marketValue,
      unrealizedPnl: marketValue - costTotal,
    });
  });
  return positions.sort((a, b) => b.marketValue - a.marketValue);
}
