import { store } from '../../store';
import { getRepo } from '../../services/repo';
import { loadConfig, pricesOf } from '../../services/config';
import { amountText, qtyText } from '../../services/format';
import { liToYuan, unitPriceLi } from '../../domain/money';
import { replay } from '../../domain/replay';

Page({
  data: {
    uuid: '',
    title: '记录已保存',
    pnl: 0,
    showPnl: false,
    name: '',
    dirText: '',
    priceText: '',
    qtyText: '',
    amountText: '',
    allocText: '',
    costUp: false,
    costUpText: '',
  },

  async onLoad(query: Record<string, string>) {
    const uuid = query.uuid ?? '';
    const config = await loadConfig(getRepo());
    const txs = store.get().transactions;
    const tx = txs.find((t) => t.uuid === uuid);
    if (!tx) return;

    const inst = config.instruments.find((i) => i.id === tx.instrumentId);
    const result = replay(txs, { defaultMethod: 'weighted', prices: pricesOf(config) });
    const sell = result.sells.find((s) => s.uuid === uuid);

    let costUp = false;
    let costUpText = '';
    if (tx.direction === 'sell' && sell) {
      const before = replay(txs.filter((t) => t.uuid !== uuid), {
        defaultMethod: 'weighted',
        prices: pricesOf(config),
      });
      const posBefore = before.positions.find((p) => p.instrumentId === tx.instrumentId);
      const posAfter = result.positions.find((p) => p.instrumentId === tx.instrumentId);
      if (posBefore && posAfter) {
        const uBefore = unitPriceLi(posBefore.costTotal, posBefore.quantity);
        const uAfter = unitPriceLi(posAfter.costTotal, posAfter.quantity);
        if (uBefore !== uAfter) {
          costUp = true;
          costUpText = `剩余持仓成本由 ${liToYuan(uBefore, 3)} 元变为 ${liToYuan(uAfter, 3)} 元，这是指定批次卖出的正常结果。`;
        }
      }
    }

    const allocText = sell
      ? sell.allocations
          .map((a) => {
            const lot = result.lots.find((l) => l.lotId === a.lotId);
            return lot ? `${liToYuan(lot.unitPrice, 2)} × ${qtyText(a.quantity)}` : '';
          })
          .filter(Boolean)
          .join('、')
      : '';

    this.setData({
      uuid,
      title: tx.direction === 'buy' ? '买入已记录' : '卖出已记录',
      pnl: sell ? sell.pnl : 0,
      showPnl: !!sell,
      name: inst ? inst.name : tx.instrumentId,
      dirText: tx.direction === 'buy' ? '买入' : '卖出',
      priceText: liToYuan(tx.price, 2),
      qtyText: qtyText(tx.quantity),
      amountText: amountText(tx.amount),
      allocText,
      costUp,
      costUpText,
    });
  },

  goRecords() {
    wx.switchTab({ url: '/pages/records/index' });
  },

  goAgain() {
    wx.redirectTo({ url: '/pages/trade-edit/index?type=buy' });
  },

  goGuide() {
    wx.navigateTo({ url: '/pages/method-guide/index' });
  },
});
