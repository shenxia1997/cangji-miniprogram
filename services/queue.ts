import type { Repo } from './repo';
import type { SyncTask } from './types';
import { readJson, writeJson, STORAGE_KEYS } from './storage';

const MAX_BACKOFF = 60_000;

/**
 * 同步队列：本地优先架构下，写入先落地本地，再异步推云端。
 * 三个触发时机：网络恢复、小程序启动、切回前台。
 */
export class SyncQueue {
  private tasks: SyncTask[] = [];

  constructor(private repo: Repo, private now: () => number = Date.now) {
    const saved = readJson<SyncTask[]>(STORAGE_KEYS.queue);
    if (saved) this.tasks = saved;
  }

  get size(): number {
    return this.tasks.length;
  }

  pending(): SyncTask[] {
    return this.tasks.slice();
  }

  enqueue(uuid: string): void {
    if (this.tasks.some((t) => t.uuid === uuid)) return;
    this.tasks.push({ uuid, attempts: 0, nextAt: 0 });
    this.persist();
  }

  /** 到点且未超过退避时间的任务 */
  due(): SyncTask[] {
    const now = this.now();
    return this.tasks.filter((t) => t.nextAt <= now);
  }

  /**
   * 执行一轮同步。push 由调用方注入（通常是从本地表读出后写云端）。
   * 成功即出队；失败按 1s/2s/4s… 退避，上限 60s。
   */
  async flush(push: (uuid: string) => Promise<void>): Promise<{ ok: number; failed: number }> {
    let ok = 0;
    let failed = 0;
    for (const task of this.due()) {
      try {
        await push(task.uuid);
        this.tasks = this.tasks.filter((t) => t.uuid !== task.uuid);
        ok += 1;
      } catch (e) {
        task.attempts += 1;
        task.nextAt = this.now() + Math.min(1000 * 2 ** (task.attempts - 1), MAX_BACKOFF);
        failed += 1;
      }
    }
    this.persist();
    return { ok, failed };
  }

  private persist(): void {
    writeJson(STORAGE_KEYS.queue, this.tasks);
  }
}
