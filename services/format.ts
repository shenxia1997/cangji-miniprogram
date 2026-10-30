import { centsToYuan, liToYuan } from '../domain/money';

/** 数量：千分之一股 → 展示用股数，整数不带小数 */
export function qtyText(q: number): string {
  const v = q / 1000;
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

/** 千分位整数 */
export function groupInt(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function priceText(li: number): string {
  return liToYuan(li, 2);
}

export function amountText(cents: number): string {
  return centsToYuan(cents);
}

/** 日期：M月D日 */
export function dayText(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function timeText(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 按成交日期分组，用于流水列表 */
export function groupByDay<T extends { tradedAt: number }>(items: T[]): Array<{ label: string; items: T[] }> {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const key = dayText(it.tradedAt);
    const arr = map.get(key) ?? [];
    arr.push(it);
    map.set(key, arr);
  }
  return Array.from(map.entries()).map(([label, list]) => ({ label, items: list }));
}
