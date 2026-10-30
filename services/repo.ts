import type { Transaction } from '../domain/types';
import type { AppConfig, Snapshot } from './types';

/**
 * 数据访问层的唯一入口。
 * 页面与领域层都不得直连 wx.cloud —— 将来迁到自建服务时，只需替换 CloudRepo 的实现。
 * 说明：数据库字段沿用 Transaction 的驼峰命名，不做 snake_case 映射，减少一层出错机会。
 */
export interface Repo {
  listTransactions(opts?: { since?: number; includeDeleted?: boolean }): Promise<Transaction[]>;
  putTransaction(tx: Transaction): Promise<void>;
  softDelete(uuid: string, at: number): Promise<void>;
  pullIncremental(cursor: number): Promise<{ items: Transaction[]; nextCursor: number }>;
  getSnapshot(): Promise<Snapshot | null>;
  putSnapshot(s: Snapshot): Promise<void>;
  getConfig(): Promise<AppConfig>;
  putConfig(c: AppConfig): Promise<void>;
}

/** 纯内存实现 —— 单元测试与离线首屏使用 */
export class MemRepo implements Repo {
  private txs = new Map<string, Transaction>();
  private snapshot: Snapshot | null = null;
  private config: AppConfig | null = null;
  private version = 0;

  constructor(seed?: { transactions?: Transaction[]; config?: AppConfig }) {
    for (const tx of seed?.transactions ?? []) this.txs.set(tx.uuid, { ...tx });
    if (seed?.config) this.config = JSON.parse(JSON.stringify(seed.config));
  }

  async listTransactions(opts: { since?: number; includeDeleted?: boolean } = {}): Promise<Transaction[]> {
    const since = opts.since ?? 0;
    return Array.from(this.txs.values())
      .filter((t) => (opts.includeDeleted ? true : !t.deletedAt))
      .filter((t) => t.updatedAt >= since)
      .map((t) => ({ ...t }))
      .sort((a, b) => a.tradedAt - b.tradedAt);
  }

  async putTransaction(tx: Transaction): Promise<void> {
    this.txs.set(tx.uuid, { ...tx });
    this.version += 1;
    this.snapshot = null; // 版本变化即快照失效
  }

  async softDelete(uuid: string, at: number): Promise<void> {
    const tx = this.txs.get(uuid);
    if (!tx) return;
    this.txs.set(uuid, { ...tx, deletedAt: at, updatedAt: at, rev: tx.rev + 1 });
    this.version += 1;
    this.snapshot = null;
  }

  async pullIncremental(cursor: number): Promise<{ items: Transaction[]; nextCursor: number }> {
    const items = Array.from(this.txs.values()).filter((t) => t.updatedAt > cursor);
    const nextCursor = items.reduce((a, t) => Math.max(a, t.updatedAt), cursor);
    return { items, nextCursor };
  }

  async getSnapshot(): Promise<Snapshot | null> {
    return this.snapshot;
  }

  async putSnapshot(s: Snapshot): Promise<void> {
    this.snapshot = s;
  }

  async getConfig(): Promise<AppConfig> {
    if (!this.config) throw new Error('config 未初始化');
    return this.config;
  }

  async putConfig(c: AppConfig): Promise<void> {
    this.config = c;
  }

  get dataVersion(): number {
    return this.version;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** 云开发实现 —— 仅在真实小程序环境调用 */
export class CloudRepo implements Repo {
  private coll(name: string): any {
    return (wx.cloud as any).database().collection(name);
  }

  private cmd(): any {
    return (wx.cloud as any).database().command;
  }

  async listTransactions(opts: { since?: number; includeDeleted?: boolean } = {}): Promise<Transaction[]> {
    const where: Record<string, unknown> = {};
    if (!opts.includeDeleted) where.deletedAt = 0;
    if (opts.since) where.updatedAt = this.cmd().gt(opts.since);

    const pageSize = 100;
    const out: Transaction[] = [];
    for (let skip = 0; ; skip += pageSize) {
      const res = await this.coll('transactions')
        .where(where)
        .orderBy('tradedAt', 'asc')
        .skip(skip)
        .limit(pageSize)
        .get();
      const rows = (res.data ?? []) as Transaction[];
      out.push(...rows);
      if (rows.length < pageSize) break;
    }
    return out;
  }

  async putTransaction(tx: Transaction): Promise<void> {
    const res = await this.coll('transactions').where({ uuid: tx.uuid }).get();
    if (res.data && res.data.length > 0) {
      await this.coll('transactions').doc(res.data[0]._id).update({ data: tx });
    } else {
      await this.coll('transactions').add({ data: tx });
    }
  }

  async softDelete(uuid: string, at: number): Promise<void> {
    const res = await this.coll('transactions').where({ uuid }).get();
    if (!res.data || res.data.length === 0) return;
    await this.coll('transactions')
      .doc(res.data[0]._id)
      .update({ data: { deletedAt: at, updatedAt: at } });
  }

  async pullIncremental(cursor: number): Promise<{ items: Transaction[]; nextCursor: number }> {
    const res = await this.coll('transactions')
      .where({ updatedAt: this.cmd().gt(cursor) })
      .orderBy('updatedAt', 'asc')
      .limit(100)
      .get();
    const items = (res.data ?? []) as Transaction[];
    const nextCursor = items.reduce((a, t) => Math.max(a, t.updatedAt ?? 0), cursor);
    return { items, nextCursor };
  }

  async getSnapshot(): Promise<Snapshot | null> {
    const res = await this.coll('snapshots').limit(1).get();
    return ((res.data ?? [])[0] as Snapshot) ?? null;
  }

  async putSnapshot(s: Snapshot): Promise<void> {
    const res = await this.coll('snapshots').limit(1).get();
    if (res.data && res.data.length > 0) {
      await this.coll('snapshots').doc(res.data[0]._id).update({ data: s });
    } else {
      await this.coll('snapshots').add({ data: s });
    }
  }

  async getConfig(): Promise<AppConfig> {
    const res = await this.coll('users').limit(1).get();
    const row = (res.data ?? [])[0] as AppConfig | undefined;
    if (!row) throw new Error('用户配置缺失');
    return row;
  }

  async putConfig(c: AppConfig): Promise<void> {
    const res = await this.coll('users').limit(1).get();
    if (res.data && res.data.length > 0) {
      await this.coll('users').doc(res.data[0]._id).update({ data: c });
    } else {
      await this.coll('users').add({ data: c });
    }
  }
}

let repo: Repo | null = null;

/** 全局单例：小程序环境用 CloudRepo，测试环境注入 MemRepo */
export function getRepo(): Repo {
  if (!repo) repo = new CloudRepo();
  return repo;
}

export function setRepo(next: Repo): void {
  repo = next;
}
