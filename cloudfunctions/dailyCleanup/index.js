const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const RETAIN_DAYS = 30;

/** 每日清理：物理删除超过 30 天的软删除记录（回收站到期） */
exports.main = async () => {
  const cutoff = Date.now() - RETAIN_DAYS * 24 * 3600 * 1000;

  const res = await db
    .collection('transactions')
    .where({ deletedAt: _.gt(0).and(_.lt(cutoff)) })
    .limit(1000)
    .get();

  let removed = 0;
  for (const t of res.data) {
    await db.collection('transactions').doc(t._id).remove();
    removed += 1;
  }

  return { removed, cutoff };
};
