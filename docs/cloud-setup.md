# 云开发配置

## 集合

| 集合 | 用途 | 索引 |
| --- | --- | --- |
| `transactions` | 交易记录 | `_openid + deletedAt + tradedAt`（升序）、`_openid + uuid`（唯一）、`_openid + updatedAt` |
| `users` | 用户配置（账户、标的、默认口径） | `_openid` |
| `accounts` | 账户（可选，当前存放在 users 内） | `_openid` |
| `instruments` | 标的（可选，当前存放在 users 内） | `_openid + code` |
| `snapshots` | 持仓快照缓存 | `_openid + dataVersion` |

> **不建 `lots` 集合**。批次完全由买入交易派生，落库会产生两份真相。

## 安全规则

`transactions` 与 `snapshots` 统一使用：

```json
{
  "read": "doc._openid == auth.openid",
  "write": "doc._openid == auth.openid"
}
```

`users`：

```json
{
  "read": "doc._openid == auth.openid",
  "write": "doc._openid == auth.openid"
}
```

注意：客户端不得改写 `_openid` 字段，否则可伪造他人数据。

## 云函数

| 函数 | 触发 | 说明 |
| --- | --- | --- |
| `exportXlsx` | 手动调用 | 生成 CSV（UTF-8 BOM）上传云存储，返回 fileID |
| `recalcUser` | 定时抽样 | 服务端复算份额守恒，与快照比对 |
| `repairData` | 手动 | 标记超卖等历史脏数据，不静默改写 |
| `dailyCleanup` | 每日 03:00 | 物理删除超过 30 天的软删除记录 |

部署：在开发者工具中右键各函数目录 → 上传并部署（云端安装依赖）。

## 定时触发器（dailyCleanup）

在云开发控制台为 `dailyCleanup` 添加触发器：

```
Cron: 0 0 3 * * * *
```

## 数据规范

- 金额字段一律整数：`amount`/`feeTotal`/`costTotal` 单位为分，`price` 单位为厘。
- `quantity` 单位为千分之一股，整数。
- `deletedAt = 0` 表示未删除；软删除保留 30 天。
- `uuid` 为客户端生成的幂等键，与 `_openid` 组合唯一。
