const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

/**
 * 服务端交叉校验：只看份额守恒（买入总量 - 卖出总量 == 持仓快照份额）。
 * 完整盈亏复算需要与客户端同一份 domain 代码，属于 T37 的后续范围。
 */
exports.main = async (event) => {
  const userId = event.userId || cloud.getWXContext().OPENID;

  const txs = await db
    .collection('transactions')
    .where({ _openid: userId, deletedAt: 0 })
    .limit(1000)
    .get();

  let buyQty = 0;
  let sellQty = 0;
  const anomalies = [];

  for (const t of txs.data) {
    if (t.quantity <= 0) anomalies.push({ uuid: t.uuid, code: 'E_ZERO_QTY' });
    if (t.direction === 'buy') buyQty += t.quantity;
    else sellQty += t.quantity;
  }

  const expectQty = buyQty - sellQty;
  const snap = await db.collection('snapshots').limit(1).get();
  const positions = (snap.data[0] && snap.data[0].positions) || [];
  const actualQty = positions.reduce((a, p) => a + p.quantity, 0);

  return {
    userId,
    tradeCount: txs.data.length,
    expectQty,
    actualQty,
    match: expectQty === actualQty,
    anomalies,
  };
};
