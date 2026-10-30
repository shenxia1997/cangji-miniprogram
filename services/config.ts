import type { Instrument, Account, AppConfig } from './types';
import { DEFAULT_CONFIG } from './types';
import type { Repo } from './repo';

/** 6 位代码规则：沪 6 开头、深 0/3 开头、北交所 8/4 开头 */
export function validateCode(code: string): { ok: boolean; market?: Instrument['market']; message?: string } {
  const c = code.trim();
  if (!/^\d{6}$/.test(c)) return { ok: false, message: '请输入 6 位数字代码' };
  if (c.startsWith('6')) return { ok: true, market: 'sh' };
  if (c.startsWith('0') || c.startsWith('3')) return { ok: true, market: 'sz' };
  if (c.startsWith('8') || c.startsWith('4')) return { ok: true, market: 'bj' };
  return { ok: true, market: 'fund' };
}

/** 按费率模板预估费用：佣金 = 成交额 × 费率（有最低佣金），印花税仅卖出 */
export function estimateFee(
  amountCents: number,
  account: Account,
  direction: 'buy' | 'sell'
): { commission: number; stamp: number; total: number } {
  const t = account.feeTemplate;
  const commission = Math.max(Math.round((amountCents * t.commissionRate) / 10000), t.minCommission);
  const stamp = direction === 'sell' ? Math.round((amountCents * t.stampRate) / 1000) : 0;
  return { commission, stamp, total: commission + stamp };
}

export async function loadConfig(repo: Repo): Promise<AppConfig> {
  try {
    return await repo.getConfig();
  } catch {
    return { ...DEFAULT_CONFIG, accounts: DEFAULT_CONFIG.accounts.map((a) => ({ ...a })) };
  }
}

export async function addAccount(repo: Repo, name: string): Promise<AppConfig> {
  const config = await loadConfig(repo);
  const account: Account = {
    id: `acc-${Date.now().toString(36)}`,
    name: name.trim() || '新账户',
    feeTemplate: config.accounts[0]?.feeTemplate ?? DEFAULT_CONFIG.accounts[0].feeTemplate,
  };
  const next = { ...config, accounts: [...config.accounts, account] };
  await repo.putConfig(next);
  return next;
}

export async function renameAccount(repo: Repo, id: string, name: string): Promise<AppConfig> {
  const config = await loadConfig(repo);
  const next = {
    ...config,
    accounts: config.accounts.map((a) => (a.id === id ? { ...a, name: name.trim() || a.name } : a)),
  };
  await repo.putConfig(next);
  return next;
}

/** 删除账户：如果名下还有交易，必须阻断，提示先迁移 */
export async function removeAccount(
  repo: Repo,
  id: string
): Promise<{ ok: boolean; message?: string; config?: AppConfig }> {
  const txs = await repo.listTransactions();
  const used = txs.filter((t) => t.accountId === id);
  if (used.length > 0) {
    return { ok: false, message: `该账户下还有 ${used.length} 笔记录，请先迁移或删除` };
  }
  const config = await loadConfig(repo);
  if (config.accounts.length <= 1) {
    return { ok: false, message: '至少保留一个账户' };
  }
  const next = { ...config, accounts: config.accounts.filter((a) => a.id !== id) };
  await repo.putConfig(next);
  return { ok: true, config: next };
}

export async function upsertInstrument(
  repo: Repo,
  input: { code: string; name: string; type: Instrument['type'] }
): Promise<{ ok: boolean; message?: string; config?: AppConfig }> {
  const check = validateCode(input.code);
  if (!check.ok) return { ok: false, message: check.message };

  const config = await loadConfig(repo);
  const exists = config.instruments.find((i) => i.code === input.code);
  if (exists) return { ok: true, config };

  const instrument: Instrument = {
    id: `inst-${input.code}`,
    code: input.code,
    name: input.name.trim(),
    type: input.type,
    market: check.market ?? 'fund',
    lastPrice: 0,
    priceUpdatedAt: 0,
    starred: false,
  };
  const next = { ...config, instruments: [...config.instruments, instrument] };
  await repo.putConfig(next);
  return { ok: true, config: next };
}

export async function updateLastPrice(
  repo: Repo,
  code: string,
  priceLi: number
): Promise<AppConfig> {
  const config = await loadConfig(repo);
  const next = {
    ...config,
    instruments: config.instruments.map((i) =>
      i.code === code ? { ...i, lastPrice: priceLi, priceUpdatedAt: Date.now() } : i
    ),
  };
  await repo.putConfig(next);
  return next;
}

export function pricesOf(config: AppConfig): Record<string, { lastPrice: number; priceUpdatedAt: number }> {
  const out: Record<string, { lastPrice: number; priceUpdatedAt: number }> = {};
  for (const i of config.instruments) {
    out[i.id] = { lastPrice: i.lastPrice, priceUpdatedAt: i.priceUpdatedAt };
  }
  return out;
}

export function findInstrument(config: AppConfig, instrumentId: string): Instrument | undefined {
  return config.instruments.find((i) => i.id === instrumentId || i.code === instrumentId);
}
