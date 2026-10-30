import { store } from '../../store';
import { getRepo } from '../../services/repo';
import { loadConfig } from '../../services/config';
import { amountText, groupByDay, priceText, qtyText } from '../../services/format';
import { formatSigned, liToYuan } from '../../domain/money';

interface Row {
  uuid: string;
  name: string;
  dirText: string;
  dirClass: string;
  priceText: string;
  qtyText: string;
  amountText: string;
  tagText: string;
  pnlText: string;
  tradedAt: number;
}

Page({
  data: {
    ready: false,
    filter: 'all',
    filters: [
      { key: 'all', label: '全部' },
      { key: 'buy', label: '买入' },
      { key: 'sell', label: '卖出' },
    ],
    groups: [] as Array<{ label: string; items: Row[] }>,
  },

  onLoad(query: Record<string, string>) {
    if (query.filter) this.setData({ filter: query.filter });
  },

  onShow() {
    void this.refresh();
  },

  async refresh() {
    const config = await loadConfig(getRepo());
    const txs = store.get().transactions.filter((t) => !t.deletedAt);
    const filtered = txs
      .filter((t) => this.data.filter === 'all' || t.direction === this.data.filter)
      .sort((a, b) => b.tradedAt - a.tradedAt);

    const rows: Row[] = filtered.map((t) => {
      const inst = config.instruments.find((i) => i.id === t.instrumentId);
      const lot = t.allocations.length > 0
        ? store.get().lots.find((l) => l.lotId === t.allocations[0].lotId)
        : undefined;
      return {
        uuid: t.uuid,
        name: inst ? inst.name : t.instrumentId,
        dirText: t.direction === 'buy' ? '买' : '卖',
        dirClass: t.direction === 'buy' ? 'buy' : 'sell',
        priceText: liToYuan(t.price, 2),
        qtyText: qtyText(t.quantity),
        amountText: amountText(t.amount),
        tagText: lot ? `批次 ${liToYuan(lot.unitPrice, 2)}` : '',
        pnlText: '',
        tradedAt: t.tradedAt,
      };
    });

    this.setData({ ready: true, groups: groupByDay(rows) });
  },

  switchFilter(e: WechatMiniprogram.TouchEvent) {
    this.setData({ filter: String(e.currentTarget.dataset.key) }, () => void this.refresh());
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/trade-edit/index?type=buy' });
  },

  openTx(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id);
    wx.navigateTo({ url: `/pages/trade-edit/index?type=sell&id=${id}` });
  },
});

export {};
