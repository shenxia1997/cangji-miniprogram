import { store } from '../../store';
import { getRepo } from '../../services/repo';
import { loadConfig } from '../../services/config';
import { amountText } from '../../services/format';
import { feeBreakdown, rangeStats, ranking } from '../../domain/stats';
import { replay } from '../../domain/replay';
import { formatSigned } from '../../domain/money';
import type { RangeStats } from '../../domain/stats';

type RangeKey = 'month' | 'quarter' | 'year' | 'all';

function rangeOf(key: RangeKey): { from: number; to: number } {
  const now = Date.now();
  const d = new Date(now);
  const to = now;
  if (key === 'all') return { from: 0, to };
  if (key === 'year') return { from: new Date(d.getFullYear(), 0, 1).getTime(), to };
  if (key === 'quarter') {
    const month = d.getMonth();
    const startMonth = month - (month % 3);
    return { from: new Date(d.getFullYear(), startMonth, 1).getTime(), to };
  }
  return { from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to };
}

Page({
  data: {
    range: 'month' as RangeKey,
    ranges: [
      { key: 'month', label: '本月' },
      { key: 'quarter', label: '近三月' },
      { key: 'year', label: '今年' },
      { key: 'all', label: '全部' },
    ],
    realized: 0,
    buyText: '0.00',
    sellText: '0.00',
    feeText: '0.00',
    count: 0,
    ranking: [] as Array<{ instrumentId: string; name: string; pnl: number; pnlText: string; width: number }>,
  },

  onShow() {
    void this.refresh();
  },

  async refresh() {
    const config = await loadConfig(getRepo());
    const state = store.get();
    const txs = state.transactions;
    const { from, to } = rangeOf(this.data.range);

    const result = replay(txs, { defaultMethod: 'weighted', prices: {} });
    const stats: RangeStats = rangeStats(txs, result, from, to);
    const fees = feeBreakdown(txs.filter((t) => t.tradedAt >= from && t.tradedAt <= to));

    const rank = ranking(result);
    const maxAbs = Math.max(1, ...rank.map((r) => Math.abs(r.realizedPnl)));

    this.setData({
      realized: stats.realizedPnl,
      buyText: amountText(stats.buyAmount),
      sellText: amountText(stats.sellAmount),
      feeText: amountText(fees.reduce((a, f) => a + f.amount, 0)),
      count: stats.tradeCount,
      ranking: rank.map((r) => {
        const inst = config.instruments.find((i) => i.id === r.instrumentId);
        return {
          instrumentId: r.instrumentId,
          name: inst ? inst.name : r.instrumentId,
          pnl: r.realizedPnl,
          pnlText: formatSigned(r.realizedPnl),
          width: Math.round((Math.abs(r.realizedPnl) / maxAbs) * 100),
        };
      }),
    });
  },

  switchRange(e: WechatMiniprogram.TouchEvent) {
    this.setData({ range: String(e.currentTarget.dataset.key) as RangeKey }, () => void this.refresh());
  },
});
