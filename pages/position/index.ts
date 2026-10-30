import { store } from '../../store';
import { getRepo } from '../../services/repo';
import { loadConfig } from '../../services/config';
import { amountText, priceText, qtyText } from '../../services/format';
import { unitPriceLi } from '../../domain/money';

interface Row {
  instrumentId: string;
  code: string;
  name: string;
  typeText: string;
  qtyText: string;
  costText: string;
  pnl: number;
  pnlPercent: string;
}

Page({
  data: {
    ready: false,
    totalValue: '0.00',
    totalCost: '0.00',
    totalPnl: 0,
    pnlPercent: '0.00%',
    list: [] as Row[],
  },

  onShow() {
    void this.refresh();
  },

  async refresh() {
    const config = await loadConfig(getRepo());
    const state = store.get();
    const list: Row[] = state.positions.map((p) => {
      const inst = config.instruments.find((i) => i.id === p.instrumentId);
      const pct = p.costTotal > 0 ? (p.unrealizedPnl / p.costTotal) * 100 : 0;
      return {
        instrumentId: p.instrumentId,
        code: inst ? inst.code : p.instrumentId,
        name: inst ? inst.name : '未命名标的',
        typeText: inst && inst.type === 'fund' ? '基金' : '股票',
        qtyText: qtyText(p.quantity),
        costText: priceText(unitPriceLi(p.costTotal, p.quantity)),
        pnl: p.unrealizedPnl,
        pnlPercent: `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`,
      };
    });

    const totalValue = state.positions.reduce((a, p) => a + p.marketValue, 0);
    const totalCost = state.positions.reduce((a, p) => a + p.costTotal, 0);
    const totalPnl = totalValue - totalCost;
    const pct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

    this.setData({
      ready: true,
      totalValue: amountText(totalValue),
      totalCost: amountText(totalCost),
      totalPnl,
      pnlPercent: `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`,
      list,
    });
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/trade-edit/index?type=buy' });
  },

  openInstrument(e: WechatMiniprogram.TouchEvent) {
    const code = String(e.currentTarget.dataset.code);
    wx.navigateTo({ url: `/pages/instrument/index?code=${code}` });
  },
});
