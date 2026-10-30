import type { Transaction } from '../domain/types';

export interface MergeResult {
  merged: Transaction[];
  added: number;
  duplicated: number;
}

/**
 * 合并匿名期间产生的本地交易与云端数据。
 * 以 uuid 为幂等键：同一笔在两端都存在时保留 rev 更大（最后修改）的那条。
 */
export function mergeTransactions(local: Transaction[], remote: Transaction[]): MergeResult {
  const map = new Map<string, Transaction>();
  let duplicated = 0;

  for (const tx of remote) map.set(tx.uuid, tx);

  for (const tx of local) {
    const exist = map.get(tx.uuid);
    if (!exist) {
      map.set(tx.uuid, tx);
      continue;
    }
    duplicated += 1;
    if (tx.rev > exist.rev) map.set(tx.uuid, tx);
  }

  const merged = Array.from(map.values()).sort((a, b) => a.tradedAt - b.tradedAt);
  return { merged, added: merged.length - remote.length, duplicated };
}

/** 冲突判定：同一 uuid 在两端 rev 不同，且字段确有差异 */
export function hasConflict(local: Transaction, remote: Transaction): boolean {
  if (local.uuid !== remote.uuid) return false;
  if (local.rev === remote.rev) return false;
  return (
    local.price !== remote.price ||
    local.quantity !== remote.quantity ||
    local.tradedAt !== remote.tradedAt ||
    !!local.deletedAt !== !!remote.deletedAt
  );
}

/** 客户端幂等键，避免重复提交产生两条记录 */
export function newUuid(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  return `${t}-${r}`;
}
