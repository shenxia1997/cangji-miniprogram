import { MemRepo } from '../services/repo';
import { mergeTransactions, hasConflict, newUuid } from '../services/auth';
import { SyncQueue } from '../services/queue';
import { estimateFee, validateCode } from '../services/config';
import { computeSnapshot, isFresh } from '../services/snapshot';
import { dropKey, STORAGE_KEYS } from '../services/storage';
import { DEFAULT_CONFIG } from '../services/types';
import { BUYS, CONFIG, INSTRUMENT, SELL_A, makeSell } from './fixtures/golden';

describe('Repo · 内存实现', () => {
  test('写入后快照失效，版本自增', async () => {
    const repo = new MemRepo({ config: DEFAULT_CONFIG });
    expect(await repo.getSnapshot()).toBeNull();
    await repo.putTransaction(makeSell(SELL_A));
    expect(repo.dataVersion).toBe(1);
    await repo.softDelete('sell-a', Date.now());
    expect(repo.dataVersion).toBe(2);
  });

  test('软删除的默认查询不返回，includeDeleted 才返回', async () => {
    const repo = new MemRepo({ config: DEFAULT_CONFIG });
    await repo.putTransaction(makeSell(SELL_A));
    await repo.softDelete('sell-a', 1);
    expect(await repo.listTransactions()).toHaveLength(0);
    expect(await repo.listTransactions({ includeDeleted: true })).toHaveLength(1);
  });
});

describe('快照 · 版本失效', () => {
  test('版本一致复用，不一致重算', () => {
    const snap = computeSnapshot(BUYS, {});
    expect(isFresh(snap, snap.dataVersion)).toBe(true);
    expect(isFresh(snap, snap.dataVersion + 1)).toBe(false);
  });

  test('快照数据与直接重放一致', () => {
    const snap = computeSnapshot(BUYS, { [INSTRUMENT]: { lastPrice: 52_000, priceUpdatedAt: 0 } });
    expect(snap.positions[0].quantity).toBe(1_000_000);
    expect(snap.positions[0].costTotal).toBe(4_854_500);
  });
});

describe('合并 · 匿名转登录', () => {
  test('按 uuid 去重，不重不漏', () => {
    const local = [makeSell(SELL_A)];
    const remote = [makeSell(SELL_A)];
    const res = mergeTransactions(local, remote);
    expect(res.merged).toHaveLength(1);
    expect(res.duplicated).toBe(1);
  });

  test('rev 更大的一侧胜出', () => {
    const a = makeSell({ ...SELL_A, rev: 1 });
    const b = makeSell({ ...SELL_A, rev: 3, feeCents: 9_999 });
    const res = mergeTransactions([a], [b]);
    expect(res.merged[0].rev).toBe(3);
  });

  test('字段有差异且 rev 不同才判定冲突', () => {
    const a = makeSell({ ...SELL_A, rev: 1 });
    const b = makeSell({ ...SELL_A, rev: 2, priceLi: 60_000 });
    expect(hasConflict(a, b)).toBe(true);
    expect(hasConflict(a, { ...b, price: a.price })).toBe(false);
  });

  test('幂等键唯一', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newUuid()));
    expect(ids.size).toBe(200);
  });
});

describe('同步队列', () => {
  beforeEach(() => {
    dropKey(STORAGE_KEYS.queue);
  });

  test('成功即出队，失败按退避保留', async () => {
    let now = 1_000;
    const repo = new MemRepo({ config: DEFAULT_CONFIG });
    const queue = new SyncQueue(repo, () => now);
    queue.enqueue('a');
    queue.enqueue('b');
    expect(queue.size).toBe(2);

    const res = await queue.flush(async (uuid) => {
      if (uuid === 'b') throw new Error('network');
    });
    expect(res.ok).toBe(1);
    expect(res.failed).toBe(1);
    expect(queue.size).toBe(1);

    now += 2_000;
    expect(queue.due()).toHaveLength(1);
  });

  test('重复入队不产生重复任务', () => {
    const queue = new SyncQueue(new MemRepo({ config: DEFAULT_CONFIG }));
    queue.enqueue('a');
    queue.enqueue('a');
    expect(queue.size).toBe(1);
  });
});

describe('配置 · 校验与费率', () => {
  test('代码规则', () => {
    expect(validateCode('600519').market).toBe('sh');
    expect(validateCode('000001').market).toBe('sz');
    expect(validateCode('300750').market).toBe('sz');
    expect(validateCode('830799').market).toBe('bj');
    expect(validateCode('110022').market).toBe('fund');
    expect(validateCode('60051').ok).toBe(false);
    expect(validateCode('abc123').ok).toBe(false);
  });

  test('费用预估：最低佣金兜底，印花税仅卖出', () => {
    const account = DEFAULT_CONFIG.accounts[0];
    const small = estimateFee(10_000, account, 'buy'); // 100 元
    expect(small.commission).toBe(500); // 触发最低 5 元
    const big = estimateFee(10_000_000, account, 'sell'); // 10 万元
    expect(big.commission).toBe(2_500);
    expect(big.stamp).toBe(10_000);
  });
});

describe('金标准 · 快照与逐笔一致', () => {
  test('snapshot 的已实现盈亏等于逐笔合计', () => {
    const txs = [...BUYS, makeSell(SELL_A)];
    const snap = computeSnapshot(txs, {});
    expect(snap.realizedPnl).toBe(100_590);
    expect(CONFIG.defaultMethod).toBe('weighted');
  });
});
