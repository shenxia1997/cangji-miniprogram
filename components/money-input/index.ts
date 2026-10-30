import { centsToYuan, liToYuan, yuanToCents } from '../../domain/money';

/**
 * 金额输入框：对外只暴露整数「分」，展示与存储分离。
 * 失焦时才做规范化，避免输入过程中光标跳动。
 */
Component({
  properties: {
    /** 整数分 */
    value: { type: Number, value: 0 },
    /** price 模式按厘处理并允许三位小数，price 模式按厘处理并允许三位小数 */
    mode: { type: String, value: 'amount' },
    placeholder: { type: String, value: '0.00' },
    suffix: { type: String, value: '' },
    align: { type: String, value: 'right' },
  },
  data: {
    display: '',
  },
  observers: {
    'value, mode'(value: number, mode: string) {
      const text = mode === 'price' ? liToYuan(value, 3) : centsToYuan(value, false);
      this.setData({ display: text });
    },
  },
  methods: {
    onInput(e: WechatMiniprogram.Input) {
      this.setData({ display: e.detail.value });
    },
    onBlur() {
      const raw = this.data.display;
      try {
        const cents = this.properties.mode === 'price' ? Math.round(yuanToCents(raw) * 10) : yuanToCents(raw);
        const text = this.properties.mode === 'price' ? liToYuan(cents, 3) : centsToYuan(cents, false);
        this.setData({ display: text });
        this.triggerEvent('change', { value: cents });
      } catch (err) {
        this.setData({ display: '' });
        this.triggerEvent('change', { value: 0 });
      }
    },
  },
});
