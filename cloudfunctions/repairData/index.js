const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

/**
 * 修复历史脏数据：找出「卖出量超过当时的可用持仓」的记录并打标记，
 * 由前端提示用户修正。不做静默改写 —— 改错账比报错更难被发现。
 */
exports.main = async (event) => {
  const userId = event.userId || cloud.getWXContext().OPENID;

  const res = await db
    .collection('transactions')
    .where({ _openid: userId, deletedAt: 0 })
    .orderBy('tradedAt', 'asc')
    .limit(1000)
    .get();

  const held = {};
  const broken = [];

  for (const t of res.data) {
    const key = t.instrumentId;
    held[key] = held[key] || 0;
    if (t.direction === 'buy') {
      held[key] += t.quantity;
    } else {
      if (t.quantity > held[key]) {
        broken.push({ uuid: t.uuid, need: t.quantity, available: held[key] });
        continue;
      }
      held[key] -= t.quantity;
    }
  }

  for (const item of broken) {
    await db.collection('transactions').where({ uuid: item.uuid }).update({
      data: { anomaly: 'E_OVERSELL', updatedAt: Date.now() },
    });
  }

  return { repaired: broken.length, items: broken };
};
