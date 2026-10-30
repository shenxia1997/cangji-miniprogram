import { store } from '../../store';
import { getRepo } from '../../services/repo';
import { loadConfig, estimateFee, upsertInstrument, pricesOf, findInstrument } from '../../services/config';
import { loadTransactions, upsertTransaction, writeJson, STORAGE_KEYS } from '../../services/storage';
import { qtyText } from '../../services/format';
import { mulPriceQty, yuanToCents } from '../../domain/money';
import { replay } from '../../domain/replay';
import { newUuid } from '../../services/auth';
import type { Allocation, SettleMethod, Transaction } from '../../domain/types';
import type { AppConfig } from '../../services/types';

type Dir = 'buy' | 'sell';

function todayText(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

Page({
  data: {
    type: 'buy' as Dir,
    editing: false,
    uuid: '',
    code: '',
    name: '',
    instrumentId: '',
    accounts: [] as AppConfig['accounts'],
    accountNames: [] as string[],
    accountIndex: 0,
    dateText: todayText(),
    priceLi: 0,
    qtyMilli: 0,
    qtyText: '',
    feeCents: 0,
    note: '',
    method: 'auto_weighted' as SettleMethod,
    methodText: '自动分配（加权平均）',
    allocations: [] as Allocation[],
    allocText: '未选择批次',
    availableQty: 0,
    availableText: '0',
    lots: [] as unknown[],
    lotVisible: false,
    previewPnl: null as number | null,
    canSave: false,
  },

  config: null as AppConfig | null,

  async onLoad(query: Record<string, string>) {
    const type = (query.type === 'sell' ? 'sell' : 'buy') as Dir;
    this.setData({ type });
    wx.setNavigationBarTitle({ title: type === 'buy' ? '记一笔买入' : '记一笔卖出' });

    const config = await loadConfig(getRepo());
    this.config = config;
    this.setData({
      accounts: config.accounts,
      accountNames: config.accounts.map((a) => a.name),
      accountIndex: Math.max(0, config.accounts.findIndex((a) => a.id === config.currentAccountId)),
    });

    if (query.id) {
      const tx = store.get().transactions.find((t) => t.uuid === query.id);
      if (tx) this.fillFrom(tx, config);
    }
    this.refreshAvailable();
  },

  fillFrom(tx: Transaction, config: AppConfig) {
    const inst = findInstrument(config, tx.instrumentId);
    this.setData({
      editing: true,
      uuid: tx.uuid,
      type: tx.direction,
      code: inst ? inst.code : '',
      name: inst ? inst.name : '',
      instrumentId: tx.instrumentId,
      priceLi: tx.price,
      qtyMilli: tx.quantity,
      qtyText: qtyText(tx.quantity),
      feeCents: tx.feeTotal,
      note: tx.note ?? '',
      method: tx.method,
      allocations: tx.allocations,
      dateText: this.dateOf(tx.tradedAt),
    });
    this.updateMethodText();
  },

  dateOf(ts: number): string {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },

  switchType(e: WechatMiniprogram.TouchEvent) {
    if (this.data.editing) return;
    const type = String(e.currentTarget.dataset.type) as Dir;
    this.setData({ type, previewPnl: null }, () => {
      wx.setNavigationBarTitle({ title: type === 'buy' ? '记一笔买入' : '记一笔卖出' });
      this.refreshAvailable();
    });
  },

  onCodeInput(e: WechatMiniprogram.Input) {
    this.setData({ code: e.detail.value });
  },

  onCodeBlur() {
    const config = this.config;
    if (!config) return;
    const inst = config.instruments.find((i) => i.code === this.data.code);
    if (inst) {
      this.setData({ name: inst.name, instrumentId: inst.id });
    } else {
      this.setData({ instrumentId: `inst-${this.data.code}` });
    }
    this.refreshAvailable();
  },

  onNameInput(e: WechatMiniprogram.Input) {
    this.setData({ name: e.detail.value });
  },

  onAccountChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ accountIndex: Number(e.detail.value) });
  },

  onDateChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ dateText: String(e.detail.value) });
  },

  onPriceChange(e: WechatMiniprogram.CustomEvent) {
    this.setData({ priceLi: Number(e.detail.value) }, () => this.afterAmountChange());
  },

  onQtyInput(e: WechatMiniprogram.Input) {
    const raw = e.detail.value;
    const qtyMilli = Math.round(Number(raw || 0) * 1000);
    this.setData({ qtyText: raw, qtyMilli }, () => this.afterAmountChange());
  },

  onFeeChange(e: WechatMiniprogram.CustomEvent) {
    this.setData({ feeCents: Number(e.detail.value) }, () => this.refreshPreview());
  },

  onNoteInput(e: WechatMiniprogram.Input) {
    this.setData({ note: e.detail.value });
  },

  /** 价格或数量变化后：自动预估费用 + 刷新预演 */
  afterAmountChange() {
    const { priceLi, qtyMilli } = this.data;
    const amount = mulPriceQty(priceLi, qtyMilli);
    if (amount > 0 && this.data.feeCents === 0) {
      const account = this.data.accounts[this.data.accountIndex];
      if (account) {
        const fee = estimateFee(amount, account, this.data.type);
        this.setData({ feeCents: fee.total });
      }
    }
    this.refreshPreview();
    this.validate();
  },

  setMethod(e: WechatMiniprogram.TouchEvent) {
    const m = String(e.currentTarget.dataset.m) as SettleMethod;
    this.setData({ method: m, allocations: [], allocText: '未选择批次' }, () => {
      this.updateMethodText();
      this.refreshPreview();
    });
  },

  updateMethodText() {
    const map: Record<SettleMethod, string> = {
      auto_weighted: '自动分配（加权平均）',
      auto_fifo: '自动分配（先进先出）',
      specified: '手动指定批次',
    };
    this.setData({ methodText: map[this.data.method] });
  },

  openLotPicker() {
    const instId = this.data.instrumentId;
    if (!instId) {
      wx.showToast({ title: '请先填写标的代码', icon: 'none' });
      return;
    }
    const lots = store.lotsOf(instId);
    if (lots.length === 0) {
      wx.showToast({ title: '该标的暂无可卖批次', icon: 'none' });
      return;
    }
    this.setData({ lots, lotVisible: true });
  },

  onLotClose() {
    this.setData({ lotVisible: false });
  },

  onLotConfirm(e: WechatMiniprogram.CustomEvent) {
    const allocations = (e.detail.allocations ?? []) as Allocation[];
    const text = allocations
      .map((a) => `${this.lotLabel(a.lotId)} × ${qtyText(a.quantity)}`)
      .join('、');
    this.setData({ allocations, allocText: text || '未选择批次', lotVisible: false }, () => this.refreshPreview());
  },

  lotLabel(lotId: string): string {
    const lot = store.get().lots.find((l) => l.lotId === lotId);
    return lot ? `批次 ${(lot.unitPrice / 1000).toFixed(2)}` : '批次';
  },

  refreshAvailable() {
    const instId = this.data.instrumentId || `inst-${this.data.code}`;
    const pos = store.positionOf(instId);
    const available = pos ? pos.quantity : 0;
    this.setData({ availableQty: available, availableText: qtyText(available) });
    this.validate();
  },

  /** 用真实引擎预演本笔盈亏，避免页面重写公式 */
  refreshPreview() {
    const { type, priceLi, qtyMilli, feeCents, instrumentId, method, allocations } = this.data;
    if (type !== 'sell' || priceLi <= 0 || qtyMilli <= 0) {
      this.setData({ previewPnl: null });
      return;
    }
    const txs = store.get().transactions;
    const draft: Transaction = {
      uuid: 'preview-uuid',
      instrumentId: instrumentId || `inst-${this.data.code}`,
      accountId: this.data.accounts[this.data.accountIndex]?.id ?? 'acc-default',
      direction: 'sell',
      price: priceLi,
      quantity: qtyMilli,
      amount: mulPriceQty(priceLi, qtyMilli),
      feeItems: [],
      feeTotal: feeCents,
      method,
      allocations,
      tradedAt: new Date(this.data.dateText).getTime(),
      createdAt: Date.now() + 1,
      rev: 1,
      deletedAt: 0,
      updatedAt: Date.now(),
    };
    const result = replay([...txs, draft], { defaultMethod: 'weighted', prices: {} });
    const sell = result.sells.find((s) => s.uuid === 'preview-uuid');
    this.setData({ previewPnl: sell ? sell.pnl : null });
  },

  validate() {
    const { code, name, priceLi, qtyMilli, type, availableQty } = this.data;
    let ok = /^\d{6}$/.test(code) && name.trim().length > 0 && priceLi > 0 && qtyMilli > 0;
    if (type === 'sell' && qtyMilli > availableQty) ok = false;
    this.setData({ canSave: ok });
  },

  async save() {
    if (!this.data.canSave) {
      wx.showToast({ title: '请检查必填项', icon: 'none' });
      return;
    }
    const repo = getRepo();
    const config = this.config ?? (await loadConfig(repo));
    const account = this.data.accounts[this.data.accountIndex];

    const inst = await upsertInstrument(repo, {
      code: this.data.code,
      name: this.data.name,
      type: this.data.priceLi % 10 === 0 ? 'stock' : 'fund',
    });
    if (!inst.ok) {
      wx.showToast({ title: inst.message ?? '标的创建失败', icon: 'none' });
      return;
    }
    const nextConfig = inst.config ?? config;
    this.config = nextConfig;
    const instrument = nextConfig.instruments.find((i) => i.code === this.data.code);

    const now = Date.now();
    const amount = mulPriceQty(this.data.priceLi, this.data.qtyMilli);
    const uuid = this.data.editing ? this.data.uuid : newUuid();
    const prev = this.data.editing ? store.get().transactions.find((t) => t.uuid === uuid) : undefined;

    const tx: Transaction = {
      uuid,
      instrumentId: instrument ? instrument.id : `inst-${this.data.code}`,
      accountId: account ? account.id : 'acc-default',
      direction: this.data.type,
      price: this.data.priceLi,
      quantity: this.data.qtyMilli,
      amount,
      feeItems: this.data.feeCents > 0 ? [{ type: 'commission', amount: this.data.feeCents }] : [],
      feeTotal: this.data.feeCents,
      method: this.data.type === 'sell' ? this.data.method : 'auto_weighted',
      allocations: this.data.type === 'sell' && this.data.method === 'specified' ? this.data.allocations : [],
      tradedAt: new Date(this.data.dateText).getTime(),
      createdAt: prev ? prev.createdAt : now,
      note: this.data.note,
      rev: prev ? prev.rev + 1 : 1,
      deletedAt: 0,
      updatedAt: now,
    };

    // 先落本地，再推云端：断网也能记账
    upsertTransaction(tx);
    const txs = loadTransactions();
    store.hydrate(txs, pricesOf(nextConfig), null);
    if (store.get().snapshot) writeJson(STORAGE_KEYS.snapshot, store.get().snapshot);

    try {
      await repo.putTransaction(tx);
    } catch (e) {
      // 失败保持本地，等同步队列重试
    }

    wx.redirectTo({ url: `/pages/trade-receipt/index?uuid=${uuid}` });
  },
});
