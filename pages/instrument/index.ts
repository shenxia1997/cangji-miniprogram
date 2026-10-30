import { store } from '../../store';
import { getRepo } from '../../services/repo';
import { loadConfig, updateLastPrice, pricesOf } from '../../services/config';
import { amountText, qtyText } from '../../services/format';
import { liToYuan, unitPriceLi } from '../../domain/money';
import type { Lot } from '../../domain/types';

interface LotRow {
  lotId: string;
  dateText: string;
  priceText: string;
  soldText: string;
  remainText: string;
  statusText: string;
  statusClass: string;
}

Page({
  data: {
    code: '',
    name: '',
    typeText: '股票',
    qtyText: '0',
    costText: '0.00',
    valueText: '0.00',
    unrealized: 0,
    pnlPercent: '0.00%',
    lastPrice: 0,
    lots: [] as LotRow[],
  },

  async onLoad(query: Record<string, string>) {
    this.setData({ code: query.code ?? '' });
    await this.refresh();
  },

  async refresh() {
    const config = await loadConfig(getRepo());
    const inst = config.instruments.find((i) => i.code === this.data.code);
    if (!inst) return;

    const state = store.get();
    const pos = state.positions.find((p) => p.instrumentId === inst.id);
    const lots = state.lots.filter((l) => l.instrumentId === inst.id);

    const rows: LotRow[] = lots.map((l: Lot) => {
      const d = new Date(l.openedAt);
      const sold = l.quantity - l.remainQuantity;
      const map: Record<string, { text: string; cls: string }> = {
        holding: { text: '持有中', cls: 'holding' },
        partial: { text: '部分卖出', cls: 'partial' },
        closed: { text: '已清仓', cls: 'closed' },
      };
      return {
        lotId: l.lotId,
        dateText: `${d.getMonth() + 1}月${d.getDate()}日`,
        priceText: liToYuan(l.unitPrice, 2),
        soldText: qtyText(sold),
        remainText: qtyText(l.remainQuantity),
        statusText: map[l.status].text,
        statusClass: map[l.status].cls,
      };
    });

    const pct = pos && pos.costTotal > 0 ? (pos.unrealizedPnl / pos.costTotal) * 100 : 0;

    this.setData({
      name: inst.name,
      typeText: inst.type === 'fund' ? '基金' : '股票',
      qtyText: qtyText(pos ? pos.quantity : 0),
      costText: pos ? liToYuan(unitPriceLi(pos.costTotal, pos.quantity), 3) : '0.000',
      valueText: amountText(pos ? pos.marketValue : 0),
      unrealized: pos ? pos.unrealizedPnl : 0,
      pnlPercent: `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`,
      lastPrice: inst.lastPrice,
      lots: rows,
    });
  },

  async onPriceChange(e: WechatMiniprogram.CustomEvent) {
    const priceLi = Number(e.detail.value);
    const repo = getRepo();
    const config = await updateLastPrice(repo, this.data.code, priceLi);
    store.hydrate(store.get().transactions, pricesOf(config), null);
    await this.refresh();
  },
});
