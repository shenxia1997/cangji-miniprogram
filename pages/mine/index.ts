import { store } from '../../store';
import { getRepo } from '../../services/repo';
import { loadConfig } from '../../services/config';

Page({
  data: {
    nickname: '微信用户',
    accountCount: 1,
    txCount: 0,
    methodText: '加权平均',
  },

  onShow() {
    void this.refresh();
  },

  async refresh() {
    const config = await loadConfig(getRepo());
    const txs = store.get().transactions;
    this.setData({
      accountCount: config.accounts.length,
      txCount: txs.length,
      methodText: config.defaultMethod === 'fifo' ? '先进先出' : '加权平均',
    });
  },

  goAccounts() {
    wx.navigateTo({ url: '/pages/account/index' });
  },

  goMethodGuide() {
    wx.navigateTo({ url: '/pages/method-guide/index' });
  },

  async switchMethod() {
    const repo = getRepo();
    const config = await loadConfig(repo);
    const next = { ...config, defaultMethod: config.defaultMethod === 'fifo' ? 'weighted' : 'fifo' } as typeof config;
    await repo.putConfig(next);
    this.setData({ methodText: next.defaultMethod === 'fifo' ? '先进先出' : '加权平均' });
    wx.showToast({ title: next.defaultMethod === 'fifo' ? '已切换为先进先出' : '已切换为加权平均', icon: 'none' });
  },

  exportData() {
    wx.showToast({ title: '导出功能将在 V1.1 提供', icon: 'none' });
  },
});
