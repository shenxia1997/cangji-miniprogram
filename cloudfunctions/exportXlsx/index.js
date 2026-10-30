const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

/** 交易明细 → CSV 文本（UTF-8 BOM，Excel 直接打开不乱码） */
function toCsv(rows) {
  const header = ['成交时间', '方向', '标的', '账户', '价格', '数量', '成交额', '费用', '结转成本', '已实现盈亏', '批次归属', '备注'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      new Date(r.tradedAt).toISOString(),
      r.direction === 'buy' ? '买入' : '卖出',
      r.instrumentName || r.instrumentId,
      r.accountName || r.accountId,
      (r.price / 1000).toFixed(3),
      (r.quantity / 1000).toString(),
      (r.amount / 100).toFixed(2),
      (r.feeTotal / 100).toFixed(2),
      r.costOut != null ? (r.costOut / 100).toFixed(2) : '',
      r.pnl != null ? (r.pnl / 100).toFixed(2) : '',
      (r.allocations || []).map((a) => `${a.lotId}:${a.quantity / 1000}`).join('|'),
      (r.note || '').replace(/,/g, '，'),
    ].join(','));
  }
  return '\ufeff' + lines.join('\r\n');
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const from = event.from || 0;
  const to = event.to || Date.now();

  const res = await db
    .collection('transactions')
    .where({ _openid: OPENID, deletedAt: 0, tradedAt: _.gte(from).and(_.lte(to)) })
    .orderBy('tradedAt', 'asc')
    .limit(1000)
    .get();

  const csv = toCsv(res.data);
  const upload = await cloud.uploadFile({
    cloudPath: `export/${OPENID}-${Date.now()}.csv`,
    fileContent: Buffer.from(csv, 'utf8'),
  });

  return { fileID: upload.fileID, rows: res.data.length };
};
