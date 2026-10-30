import { liToYuan } from '../../domain/money';
import { allocateSpecified } from '../../domain/allocations';
import type { Allocation, Lot } from '../../domain/types';

interface Row extends Lot {
  dateText: string;
  priceText: string;
  remainText: string;
  pnlText: string;
  picked: number;
  pickedText: string;
}

/**
 * 批次选择浮层：界面实时预演盈亏，但计算一律调用 domain，
 * 绝不在组件内重写一遍公式。
 */
Component({
  properties: {
    visible: { type: Boolean, value: false },
    lots: { type: Array, value: [] as Lot[] },
    /** 本次卖出量（千分之一股） */
    sellQty: { type: Number, value: 0 },
    /** 卖出单价（厘）与费用（分），用于预演 */
    sellPriceLi: { type: Number, value: 0 },
    sellFee: { type: Number, value: 0 },
  },
  data: {
    rows: [] as Row[],
    remain: 0,
    remainText: '0',
    sellText: '0',
    previewPnl: 0,
    canConfirm: false,
  },
  observers: {
    'visible, lots, sellQty'(visible: boolean) {
      if (visible) this.reset();
    },
  },
  methods: {
    noop() {},

    reset() {
      const rows: Row[] = (this.properties.lots as Lot[]).map((l) => ({
        ...l,
        dateText: this.dateText(l.openedAt),
        priceText: liToYuan(l.unitPrice, 2),
        remainText: this.qtyText(l.remainQuantity),
        pnlText: liToYuan(0, 2) === '' ? '' : this.signText(l.realizedPnl),
        picked: 0,
        pickedText: '0',
      }));
      this.setData({
        rows,
        remain: this.properties.sellQty,
        remainText: this.qtyText(this.properties.sellQty),
        sellText: this.qtyText(this.properties.sellQty),
        previewPnl: 0,
        canConfirm: false,
      });
    },

    onToggle(e: WechatMiniprogram.TouchEvent) {
      const i = Number(e.currentTarget.dataset.index);
      const row = this.data.rows[i];
      const picked = row.picked > 0 ? 0 : Math.min(row.remainQuantity, this.data.remain + row.picked);
      this.applyPicked(i, picked);
    },

    onInc(e: WechatMiniprogram.TouchEvent) {
      const i = Number(e.currentTarget.dataset.index);
      const row = this.data.rows[i];
      const step = Math.min(100_000, row.remainQuantity - row.picked, this.data.remain);
      if (step <= 0) return;
      this.applyPicked(i, row.picked + step);
    },

    onDec(e: WechatMiniprogram.TouchEvent) {
      const i = Number(e.currentTarget.dataset.index);
      const row = this.data.rows[i];
      const step = Math.min(100_000, row.picked);
      this.applyPicked(i, row.picked - step);
    },

    onFillFifo() {
      const rows = this.data.rows.map((r) => ({ ...r, picked: 0, pickedText: '0' }));
      let need = this.properties.sellQty;
      const order = rows
        .map((r, i) => ({ i, at: r.openedAt, id: r.lotId }))
        .sort((a, b) => (a.at - b.at) || a.id.localeCompare(b.id));
      for (const o of order) {
        if (need <= 0) break;
        const take = Math.min(need, rows[o.i].remainQuantity);
        rows[o.i].picked = take;
        rows[o.i].pickedText = this.qtyText(take);
        need -= take;
      }
      this.setData({ rows }, () => this.recompute());
    },

    applyPicked(index: number, picked: number) {
      const rows = this.data.rows.slice();
      rows[index] = { ...rows[index], picked, pickedText: this.qtyText(picked) };
      this.setData({ rows }, () => this.recompute());
    },

    recompute() {
      const picked = this.data.rows.reduce((a, r) => a + r.picked, 0);
      const remain = this.properties.sellQty - picked;

      const allocations: Allocation[] = this.data.rows
        .filter((r) => r.picked > 0)
        .map((r) => ({ lotId: r.lotId, quantity: r.picked }));

      let previewPnl = 0;
      if (remain === 0 && allocations.length > 0) {
        const res = allocateSpecified(this.properties.sellQty, allocations, this.properties.lots as Lot[]);
        if (res.ok) {
          const amount = Math.round((this.properties.sellPriceLi * this.properties.sellQty) / 10000);
          previewPnl = amount - res.costOut - this.properties.sellFee;
        }
      }

      this.setData({
        remain,
        remainText: this.qtyText(remain),
        previewPnl,
        canConfirm: remain === 0 && allocations.length > 0,
      });
    },

    onConfirm() {
      if (!this.data.canConfirm) return;
      const allocations: Allocation[] = this.data.rows
        .filter((r) => r.picked > 0)
        .map((r) => ({ lotId: r.lotId, quantity: r.picked }));
      this.triggerEvent('confirm', { allocations });
    },

    onClose() {
      this.triggerEvent('close');
    },

    dateText(ts: number): string {
      const d = new Date(ts);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    },
    qtyText(q: number): string {
      const v = q / 1000;
      return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
    },
    signText(cents: number): string {
      const v = (cents / 100).toFixed(2);
      return cents > 0 ? `+${v}` : v;
    },
  },
});
