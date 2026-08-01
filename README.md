# Agent Radar

Agent Radar 是一个面向 AI Coding 与 Agent 工程实践的个人技术情报站。它不做模型跑分或普通新闻聚合，而是把新概念和产品变化还原为来源谱系、工程证据、采用阶段与可执行方法。

## 当前版本

V1 是真实来源回放版，用于验证网站的信息架构和视觉方向：

- `/today`：今日雷达与证据脉冲。
- `/signals`：去重后的事件簇。
- `/concepts`：可修订的概念索引与分析页。
- `/graph`：概念关系图及无障碍文本替代。
- `/sources`：首批来源注册与采集优先级。
- `/playbooks`、`/digests`、`/search`：方法库、周报和跨对象搜索。

实时采集、持久化、登录与审核队列尚未接入；页面明确标识为回放数据。

## 本地运行

要求 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

验证：

```bash
npm run test
npm run lint
```

视觉规范位于 `design-system/agent-radar/MASTER.md`，实现中的偏差与边界记录在 `implementation-notes.md`。
