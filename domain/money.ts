/**
 * 金额模块 —— 全项目唯一的单位换算与格式化入口。
 * 规则：禁止浮点参与金额计算；价格用厘、数量用千分之一股、金额用分。
 */

/** 成交额（分）= round(价格(厘) × 数量(千分之一股) / 10000) */
export function mulPriceQty(priceLi: number, qtyMilli: number): number {
  assertInt(priceLi, 'price');
  assertInt(qtyMilli, 'quantity');
  return Math.round((priceLi * qtyMilli) / 10000);
}

/** 元 → 分。'51.80' → 5180，'0.005' → 1（四舍五入到分） */
export function yuanToCents(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error('E_INVALID_AMOUNT');
    return Math.round(input * 100);
  }
  const raw = String(input).trim().replace(/,/g, '').replace(/^\+/, '');
  if (raw === '' || raw === '-' || !/^-?\d*(\.\d*)?$/.test(raw) || raw === '.') {
    throw new Error('E_INVALID_AMOUNT');
  }
  const negative = raw.startsWith('-');
  const body = negative ? raw.slice(1) : raw;
  const dot = body.indexOf('.');
  const intPart = dot >= 0 ? body.slice(0, dot) : body;
  const decPart = dot >= 0 ? body.slice(dot + 1) : '';
  const cents = Number(intPart || '0') * 100 + Number((decPart + '00').slice(0, 2) || '0');
  const third = Number((decPart + '000').slice(2, 3) || '0');
  const value = cents + (third >= 5 ? 1 : 0);
  return negative ? -value : value;
}

/** 分 → 元字符串。1036500 → '10,365.00' */
export function centsToYuan(cents: number, withGrouping = true): string {
  assertInt(cents, 'cents');
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100);
  const fen = abs % 100;
  const yuanText = withGrouping ? groupThousands(yuan) : String(yuan);
  return `${negative ? '-' : ''}${yuanText}.${String(fen).padStart(2, '0')}`;
}

/** 厘 → 元字符串，用于价格展示。51800 → '51.80' */
export function liToYuan(li: number, decimals: 2 | 3 = 2): string {
  assertInt(li, 'li');
  const negative = li < 0;
  const abs = Math.abs(li);
  const unit = decimals === 2 ? 100 : 1000;
  const intPart = Math.floor(abs / 1000);
  const decPart = Math.round((abs - intPart * 1000) / (1000 / unit));
  return `${negative ? '-' : ''}${intPart}.${String(decPart).padStart(decimals, '0')}`;
}

/** 分 → 单价（厘）。1036500 / 200000 → 51800 即 51.80 元 */
export function unitPriceLi(remainCost: number, remainQtyMilli: number): number {
  if (remainQtyMilli <= 0) return 0;
  return Math.round((remainCost * 10000) / remainQtyMilli);
}

/** 带符号的盈亏文本。100590 → '+1,005.90'，0 → '0.00' */
export function formatSigned(cents: number): string {
  const text = centsToYuan(Math.abs(cents));
  if (cents > 0) return `+${text}`;
  if (cents < 0) return `-${text}`;
  return '0.00';
}

/** 安全求和，避免逐次浮点误差（这里全为整数，仅做累加保护） */
export function sumCents(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

function groupThousands(n: number): string {
  const digits = String(n);
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    const fromEnd = digits.length - i;
    out += digits[i];
    if (fromEnd > 1 && (fromEnd - 1) % 3 === 0) out += ',';
  }
  return out;
}

function assertInt(v: number, name: string): void {
  if (!Number.isInteger(v)) {
    throw new Error(`E_NOT_INTEGER: ${name}=${v}`);
  }
}
