import type { Transaction } from '../domain/types';

/**
 * 本地分片存储：单 key 上限 1MB，按 200 条一片切分，避免写入超限。
 * 运行在非小程序环境（测试）时自动降级为内存 Map。
 */
const SHARD_SIZE = 200;
const META_KEY = 'cangji:tx-meta';

interface ShardMeta {
  shards: number;
}

const memory = new Map<string, unknown>();

function hasWx(): boolean {
  return typeof wx !== 'undefined' && typeof wx.getStorageSync === 'function';
}

function readKey<T>(key: string): T | null {
  if (!hasWx()) return (memory.get(key) as T) ?? null;
  const v = wx.getStorageSync(key);
  return (v === '' || v === undefined || v === null ? null : v) as T | null;
}

function writeKey(key: string, value: unknown): void {
  if (!hasWx()) {
    memory.set(key, value);
    return;
  }
  wx.setStorageSync(key, value);
}

function removeKey(key: string): void {
  if (!hasWx()) {
    memory.delete(key);
    return;
  }
  wx.removeStorageSync(key);
}

const shardKey = (i: number): string => `cangji:tx-${i}`;

/** 全量写入，按分片切分 */
export function saveTransactions(txs: Transaction[]): void {
  const old = readKey<ShardMeta>(META_KEY);
  const oldCount = old ? old.shards : 0;
  const shards = Math.ceil(txs.length / SHARD_SIZE);

  for (let i = 0; i < shards; i++) {
    writeKey(shardKey(i), txs.slice(i * SHARD_SIZE, (i + 1) * SHARD_SIZE));
  }
  for (let i = shards; i < oldCount; i++) removeKey(shardKey(i));

  writeKey(META_KEY, { shards } as ShardMeta);
}

/** 全量读取，按分片拼装 */
export function loadTransactions(): Transaction[] {
  const meta = readKey<ShardMeta>(META_KEY);
  if (!meta) return [];
  const out: Transaction[] = [];
  for (let i = 0; i < meta.shards; i++) {
    const part = readKey<Transaction[]>(shardKey(i));
    if (part) out.push(...part);
  }
  return out;
}

/** 增量写入单笔：读改写，避免整表重写 */
export function upsertTransaction(tx: Transaction): void {
  const all = loadTransactions();
  const at = all.findIndex((t) => t.uuid === tx.uuid);
  if (at >= 0) all[at] = tx;
  else all.push(tx);
  saveTransactions(all);
}

export function clearTransactions(): void {
  const meta = readKey<ShardMeta>(META_KEY);
  const count = meta ? meta.shards : 0;
  for (let i = 0; i < count; i++) removeKey(shardKey(i));
  removeKey(META_KEY);
}

export const STORAGE_KEYS = {
  snapshot: 'cangji:snapshot',
  config: 'cangji:config',
  queue: 'cangji:queue',
  cursor: 'cangji:cursor',
  privacyAccepted: 'cangji:privacy',
};

export function readJson<T>(key: string): T | null {
  return readKey<T>(key);
}

export function writeJson(key: string, value: unknown): void {
  writeKey(key, value);
}

export function dropKey(key: string): void {
  removeKey(key);
}
