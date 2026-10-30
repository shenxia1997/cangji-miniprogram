import { getRepo } from './services/repo';
import { mergeTransactions } from './services/auth';
import { loadTransactions, saveTransactions, readJson, writeJson, STORAGE_KEYS } from './services/storage';
import { loadConfig, pricesOf } from './services/config';
import { store } from './store';
import type { AppConfig, Snapshot } from './services/types';

export interface GlobalData {
  config: AppConfig | null;
  online: boolean;
}

App<{ globalData: GlobalData }>({
  globalData: {
    config: null,
    online: true,
  },

  onLaunch() {
    if (typeof wx !== 'undefined' && wx.cloud) {
      try {
        wx.cloud.init({ env: 'cangji-prod', traceUser: true } as never);
      } catch (e) {
        // 未开通云开发时降级为纯本地
      }
    }
    void this.bootstrap();
  },

  onShow() {
    void this.sync();
  },

  /** 首屏：本地数据 → 快照 → 渲染，网络请求放在后面 */
  async bootstrap(): Promise<void> {
    const local = loadTransactions();
    const config = await loadConfig(getRepo());
    this.globalData.config = config;
    const cached = readJson<Snapshot>(STORAGE_KEYS.snapshot);
    store.hydrate(local, pricesOf(config), cached);
    if (store.get().snapshot) writeJson(STORAGE_KEYS.snapshot, store.get().snapshot);
    void this.sync();
  },

  /** 后台拉增量并与本地合并 */
  async sync(): Promise<void> {
    const repo = getRepo();
    try {
      const local = loadTransactions();
      const remote = await repo.listTransactions();
      if (remote.length === 0) return;
      const { merged } = mergeTransactions(local, remote);
      saveTransactions(merged);
      const config = this.globalData.config ?? (await loadConfig(repo));
      store.hydrate(merged, pricesOf(config), null);
      if (store.get().snapshot) writeJson(STORAGE_KEYS.snapshot, store.get().snapshot);
    } catch (e) {
      this.globalData.online = false;
    }
  },
});
