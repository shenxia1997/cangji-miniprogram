import { formatSigned } from '../../domain/money';

Component({
  properties: {
    cents: { type: Number, value: 0 },
    /** 红涨绿跌：true 时正数红、负数绿；false 时统一中性色 */
    colored: { type: Boolean, value: true },
    strong: { type: Boolean, value: false },
    signed: { type: Boolean, value: true },
  },
  data: {
    text: '0.00',
    cls: '',
  },
  observers: {
    'cents, colored, signed'(cents: number, colored: boolean, signed: boolean) {
      const text = signed ? formatSigned(cents) : formatSigned(cents).replace(/^\+/, '');
      let cls = '';
      if (colored && cents !== 0) cls = cents > 0 ? 'up' : 'down';
      this.setData({ text, cls });
    },
  },
});
