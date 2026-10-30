# tempFile · 交付物归档

仓记项目从需求到落地的全部文档、对外文章与配图。**不是代码目录**，与 `domain/`、`pages/` 等实现无关，可整目录删除而不影响小程序运行。

```
tempFile/
├── docs/     产品与工程文档（需求、方案、计划、手册、设计稿）
├── articles/ 对外发布的公众号文章（Markdown）
└── images/   文章配图（PNG + HTML 源稿）
```

---

## docs · 文档

| 文件 | 说明 |
| --- | --- |
| `01-需求文档-V1.1.docx` | 需求规格说明书，10 章。含批次管理（§4.2.5）、双口径公式（§2.2）、`transactions.allocations` 数据模型 |
| `02-技术方案.docx` | 技术方案，14 章，5 个关键决策 D1–D5 |
| `03-开发实施计划.md` | 面向人的排期：8 周、68 人日、52 任务、G0–G7 验收门 |
| `04-AI开发执行手册.md` | 面向 AI 的执行手册，735 行。§2 不可变契约、§3 金标准、§5 任务清单、§7 停止条件 |
| `05-TASKS.yaml` | 机器可读任务表：40 个任务、63 条依赖，T14 / T29 为 `blocks_phase` |
| `06-UI设计稿.html` | 9 屏高保真设计稿，375×812，浏览器直接打开 |

> `04` 与 `05` 是实现阶段的输入；`domain/`、`pages/` 的代码按这两份文件写出来的，改契约需同步改代码与测试。

## articles · 文章

| 文件 | 角度 | 篇幅 |
| --- | --- | --- |
| `01-持仓成本为什么会变高.md` | 产品认知：三种成本口径的差别 | 约 880 字 |
| `02-AI一小时做完小程序.md` | 技术协作：AI 能做什么、不能做什么 | 约 1000 字 |

两篇构成一组。建议**先发 02 再发 01**：技术向内容转发率高，能带人；产品口径那篇留存好，用来接住进来的人。

文中图片均用相对路径引用（`../images/...`），在 GitHub 上可直接渲染。

## images · 配图

### 01-成本口径篇

| 文件 | 尺寸 | 用途 |
| --- | --- | --- |
| `cover-2.35x1.png` | 1175×500 | 首图 / 封面 |
| `cover-square.png` | 1080×1080 | 转发缩略图 |
| `fig-1-buys.png` | 1080×930 | 三笔买入占比 + 均价来路 |
| `fig-2-cost-shift.png` | 1080×1140 | 359.17 元成本挪位（核心图） |
| `fig-3-methods.png` | 1080×960 | 三种口径对照 |

### 02-AI协作篇

| 文件 | 尺寸 | 用途 |
| --- | --- | --- |
| `cover-2.35x1.png` | 1175×500 | 首图 / 封面 |
| `cover-square.png` | 1080×1080 | 转发缩略图 |
| `shot-01-position.png` | 830×1704 | 持仓页 |
| `shot-02-receipt.png` | 830×1704 | 交易回执页 |
| `shot-03-guide.png` | 830×1704 | 计算口径对照页（A/B 两个答案） |
| `overview-3up.png` | 1080×940 | 三屏总览，备用不上正文 |

---

## 配图是怎么做出来的

**没有一张是 AI 生图。** 全部是 HTML/CSS 排版 → Chrome headless 截图。理由是图里含必须精确到分的数字（48.545、359.17、34,340.67、1,365.07），文生图模型画中文数字基本必错。

好处是源稿全部留在 `src/` 下，改文案、换主色、调字号只需改 HTML 再渲染一次，无损可迭代。

重新渲染：

```bash
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"

# 封面（2.35:1）
"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 --window-size=1175,500 \
  --screenshot="$PWD/cover-2.35x1.png" "file:///$PWD/src/cover.html"

# 正文图（1080 宽基准）
"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 --window-size=1080,1140 \
  --screenshot="$PWD/fig-2-cost-shift.png" "file:///$PWD/src/balance.html"

# 单屏截图（415×852）
"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 --window-size=415,852 \
  --screenshot="$PWD/shot-01-position.png" "file:///$PWD/src/shot-01-position.html"
```

**`--screenshot` 必须用绝对路径**，相对路径在 Windows 上会报「拒绝访问 (0x5)」。

### 两条踩过的坑

1. **正文图按 1080px 宽设计，不要按 1920px。** 公众号正片图在手机上只渲染约 400px 宽，1920px 源图缩到 0.2 倍，24px 正文会变成 5px，完全不可读。同理，三栏横排在手机上必然读不了，要改纵向堆叠。
2. **成本挪动不要用红绿。** 红涨绿跌是行情语义，用在「成本在两项之间移动」上会被误读为涨跌。位移量统一用主色蓝 `#2F5BEA`。

### 截图与真机的关系

`02-AI协作篇` 的三张单屏截图**不是真机截的**，是按 `pages/*/index.wxml` 的真实结构、`styles/tokens.wxss` 的真实设计变量、以及 `tests/fixtures/golden.ts` 的金标准数值重新渲染的。所以数字与正文、与代码测试三方对得上，但版式与真机可能有细微差异。

需要真机截图时，用微信开发者工具打开本项目，在模拟器里逐页截取，替换同名文件即可，文章无需改动。
