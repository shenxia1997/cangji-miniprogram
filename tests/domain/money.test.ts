import {
  centsToYuan,
  formatSigned,
  liToYuan,
  mulPriceQty,
  sumCents,
  unitPriceLi,
  yuanToCents,
} from '../../domain/money';

describe('money · 单位换算与格式化', () => {
  test('成交额 = round(价(厘) × 量(千分之一股) / 10000)', () => {
    expect(mulPriceQty(51_800, 200_000)).toBe(1_036_000);
    expect(mulPriceQty(46_900, 300_000)).toBe(1_407_000);
    expect(mulPriceQty(0, 100_000)).toBe(0);
  });

  test('元字符串转分，不经过浮点', () => {
    expect(yuanToCents('51.80')).toBe(5_180);
    expect(yuanToCents('50.2')).toBe(5_020);
    expect(yuanToCents('0.005')).toBe(1);
    expect(yuanToCents('1,036.50')).toBe(103_650);
    expect(yuanToCents('-1.5')).toBe(-150);
    expect(yuanToCents(51.8)).toBe(5_180);
    expect(() => yuanToCents('abc')).toThrow();
  });

  test('分转元，带千分位', () => {
    expect(centsToYuan(1_036_500)).toBe('10,365.00');
    expect(centsToYuan(100_590)).toBe('1,005.90');
    expect(centsToYuan(-150)).toBe('-1.50');
    expect(centsToYuan(123_456_789)).toBe('1,234,567.89');
    expect(centsToYuan(100, false)).toBe('1.00');
  });

  test('厘转元字符串', () => {
    expect(liToYuan(51_800)).toBe('51.80');
    expect(liToYuan(1_234, 3)).toBe('1.234');
  });

  test('由成本与份额反算单价', () => {
    expect(unitPriceLi(4_854_500, 1_000_000)).toBe(48_545);
    expect(unitPriceLi(3_434_067, 700_000)).toBe(49_058);
    expect(unitPriceLi(100, 0)).toBe(0);
  });

  test('盈亏文本带符号', () => {
    expect(formatSigned(100_590)).toBe('+1,005.90');
    expect(formatSigned(-3_060)).toBe('-30.60');
    expect(formatSigned(0)).toBe('0.00');
  });

  test('整数求和', () => {
    expect(sumCents([1, 2, 3])).toBe(6);
  });

  test('拒绝非整数金额，避免小数直接进入计算', () => {
    expect(() => centsToYuan(1.5)).toThrow();
    expect(() => mulPriceQty(51.5, 100)).toThrow();
  });
});
