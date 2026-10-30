import { getRepo } from '../../services/repo';
import { loadConfig, addAccount, removeAccount } from '../../services/config';

interface Row {
  id: string;
  name: string;
  rateText: string;
  minText: string;
  stampText: string;
}

Page({
  data: {
    accounts: [] as Row[],
    newName: '',
  },

  onShow() {
    void this.refresh();
  },

  async refresh() {
    const config = await loadConfig(getRepo());
    this.setData({
      accounts: config.accounts.map((a) => ({
        id: a.id,
        name: a.name,
        rateText: String(a.feeTemplate.commissionRate),
        minText: (a.feeTemplate.minCommission / 100).toFixed(2),
        stampText: String(a.feeTemplate.stampRate),
      })),
    });
  },

  onInput(e: WechatMiniprogram.Input) {
    this.setData({ newName: e.detail.value });
  },

  async add() {
    if (!this.data.newName.trim()) {
      wx.showToast({ title: '请输入账户名称', icon: 'none' });
      return;
    }
    await addAccount(getRepo(), this.data.newName);
    this.setData({ newName: '' });
    await this.refresh();
  },

  async remove(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id);
    const res = await removeAccount(getRepo(), id);
    if (!res.ok) {
      wx.showToast({ title: res.message ?? '删除失败', icon: 'none' });
      return;
    }
    await this.refresh();
  },
});
