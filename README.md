# Agent Radar

Agent Radar 是一个面向 AI Coding 与 Agent 工程实践的个人技术情报站。它不做脱离任务条件的模型总分榜或普通新闻聚合，而是把新概念和产品变化还原为来源谱系、工程证据、采用阶段与可执行方法。

## 当前版本

正式版已经接入真实采集与持久化：

- `/today`：今日雷达与证据脉冲。
- `/signals`：去重后的事件簇。
- `/discussions`：统一展示中文与英文社区讨论、证据层级和原文；社区热度不等于事实或能力。
- `/concepts`：可修订的正式概念索引，以及与正式目录隔离、保留原文的 LLM 待溯源概念候选。
- `/graph`：概念关系图及无障碍文本替代。
- `/models`：完整模型名的能力轨道、日常能力、上下文、API 价格与定时更新的 7/30 日讨论脉冲。
- `/sources`：按官方、实践者/技术媒体、社区三层统一管理的多语言来源注册表。
- `/playbooks`、`/digests`、`/search`：方法库、周报和跨对象搜索。

- 39 个公开免登录来源，覆盖全球与中文团队发布流、独立实践者、定向论文/技术媒体和中英文开发者社区；产品不按地域分榜。
- SQLite 保存原始文章、来源健康度和每次任务结果；页面读取原子 JSON 快照。
- 中英文宽召回、正文补全后二次相关性过滤、URL 去重、eventKey 事件聚类和概念归类。
- 无密钥即可使用规则分析；可选择 DeepSeek 或 OpenAI 执行 publish/watch/reject 编辑判断、相关性/新颖性/证据质量精排与结构化中文工程分析，单篇失败自动降级。`watch + candidateConcept` 只进入候选队列，不会发布为信号。
- systemd timer 每 4 小时采集，单一来源失败不会清空或阻断既有内容。

网站是公开只读访问，不要求登录。采集入口仅存在于服务器脚本和 systemd，不对公网暴露写接口。

`/models` 有两条时间轴：名称、上下文与价格是带核验日期和厂商原始链接的编辑数据；能力 1–5 档是 Radar 的方向性选型判断，不是统一 benchmark，这些字段不会被四小时任务或 LLM 静默改写。模型相关的官方、实践者和社区讨论计数及原文链接会随定时采集更新。

## 本地运行

要求 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

本地执行一次真实采集：

```bash
npm run ingest
npm run radar:status
```

验证：

```bash
npm run test
npm run lint
```

视觉规范位于 `design-system/agent-radar/MASTER.md`，实现中的偏差与边界记录在 `implementation-notes.md`。

## 自有服务器部署

正式项目名为 `agent-radar`，生产域名为 `radar.jayjp.com`。项目使用标准 Next.js 自托管，不依赖 Cloudflare、OpenAI Sites、Vercel 或 Docker。生产进程固定监听 `127.0.0.1:3002`：金融站继续使用 3000，Agent 课程站继续使用 3001。

服务器要求：

- Node.js `>=22.13.0`、Git、Nginx 与 `curl`。
- `radar.jayjp.com` 的 DNS A 记录指向目标服务器。

首次部署：

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL> agent-radar
cd agent-radar
npm ci
chmod +x scripts/*.sh

# 可选；不填写任何模型 Key 时仍可完整运行规则分析
cp .env.example .env.production
chmod 600 .env.production

# 先生成第一份正式数据快照
npm run ingest

./scripts/restart.sh
sudo ./scripts/configure-nginx.sh
sudo ./scripts/install-scheduler.sh
```

`start.sh` 在启动前检查 3002；如果端口已经被其他服务监听，会直接退出，不会终止或覆盖现有进程。PID 与日志分别保存在 `.run/agent-radar.pid` 和 `.run/agent-radar.log`。

`configure-nginx.sh` 会从当前 Nginx 生效配置中寻找覆盖 `radar.jayjp.com` 的现有证书与匹配私钥（例如服务器已有的 `*.jayjp.com` 证书），同时生成 HTTP 跳转和 HTTPS 反向代理。执行前后都会验证金融站 3000、Agent 站 3001、Radar 站 3002 及其 HTTPS 域名身份；任何检查或 reload 失败都会恢复 Radar 修改前的配置。脚本不会修改另外两个站点的配置。

日常更新：

```bash
git pull --ff-only
npm ci
./scripts/restart.sh
```

如果 `install-scheduler.sh` 本身有更新，再重新执行一次安装脚本。它只会覆盖带有 `# managed-by: agent-radar` 标记的两个 Agent Radar unit。

`stop.sh` 只会终止 PID 文件中且工作目录属于本项目的 Next.js 进程，不会按名称批量终止 Node。`restart.sh` 只负责安全停止、重新构建和启动。

## AI 分析供应商

分析层支持 `deepseek`、`openai`、`rules` 和 `auto`。推荐在服务器 `.env.production` 显式选择供应商；密钥不得提交到 Git。

DeepSeek 配置：

```dotenv
RADAR_AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=你的DeepSeekKey
RADAR_DEEPSEEK_MODEL=deepseek-v4-flash
RADAR_DEEPSEEK_BASE_URL=https://api.deepseek.com
```

OpenAI 配置：

```dotenv
RADAR_AI_PROVIDER=openai
OPENAI_API_KEY=你的OpenAIKey
RADAR_OPENAI_MODEL=gpt-5.6-terra
```

`auto` 用于兼容既有部署：优先使用已配置的 OpenAI；没有 OpenAI Key、但存在 DeepSeek Key 时使用 DeepSeek；两个 Key 都没有时使用本地规则。`RADAR_AI_PROVIDER=rules` 或 `RADAR_DISABLE_AI=1` 可以强制关闭外部模型。

供应商只分析本轮新收录文章。既有文章不会自动重算，以避免重复计费和历史结果无声漂移。DeepSeek 返回有效标题、摘要和工程含义、但分类枚举越界时，分类字段由本地确定性规则修复，并在日志与任务结果中记录 `AI repairs`；模型返回空内容、缺少核心文本、无效 JSON、超时或服务异常时才会重试并最终回退整篇规则分析。

配置完成后可执行一次小额真实请求验证 Key、模型和结构化输出；命令不会打印密钥或分析正文：

```bash
npm run ai:check
```

## 自动采集原理

`agent-radar-ingest.timer` 每四小时触发一次独立的 oneshot 服务。每次运行依次完成：

1. 从 `config/sources.json` 读取正式来源注册表。
2. 并发抓取 RSS/Atom、公开 JSON API、GitHub Releases 和经过 URL 白名单约束的 HTML 页面；每次 HTTPS 请求都会拒绝内网/元数据地址和非安全重定向，并把已验证的 DNS 地址固定到实际 TLS 连接以阻断 DNS rebinding。
3. 进行中英文宽召回、按来源轮询补全正文和二次相关性检查；即使来源数超过发布上限，也先保证每个到期来源至少一篇进入正文判断。官方、实践者与社区证据分别计数，社区重复不能自行升级为高置信。
4. 按 `RADAR_AI_PROVIDER` 使用 DeepSeek Chat Completions、OpenAI Responses API 或本地规则给出 publish/watch/reject 决策与编辑分数，再按 eventKey、版本和概念边界聚类；外部模型失败自动回退规则。证据不足的新概念候选会隔离保存，等待后续溯源，不参与公开信号与正式概念排序；后续复核通过可原位晋级，复核否决则保留审计行并从候选池退役。
5. 在 `.data/agent-radar.sqlite` 中提交文章、来源健康度和任务记录。
6. 生成 `.data/radar-snapshot.json` 临时文件，完整写入并同步后原子替换线上快照。

systemd 每四小时唤醒一次采集服务；每个来源再按 `config/sources.json` 的 4h/8h/12h/24h cadence 判断是否到期。手工执行 `npm run ingest` 会忽略 cadence 并立即扫描全部启用来源。

网站只读取最后一份完整快照。所有来源同时失败、进程中断或新快照写入失败时，旧快照保持不变。

常用运维命令：

```bash
# 手工补跑
npm run ingest

# 查看网站当前数据状态
npm run radar:status
curl http://127.0.0.1:3002/api/status

# 查看定时器和采集日志
systemctl list-timers agent-radar-ingest.timer
sudo journalctl -u agent-radar-ingest.service -n 100 --no-pager
```

Nginx 脚本只管理带有 `# managed-by: agent-radar` 标记的 `radar.jayjp.com` 配置；如果发现同名域名已经由其他配置处理，会直接退出。它会先执行 `nginx -t`，验证失败时恢复原文件，并且不会修改 `agent.jayjp.com` 或 `lona.jayjp.com`。

如果证书未出现在现有 Nginx 配置中，可显式传入证书路径：

```bash
sudo env SSL_CERTIFICATE=/path/to/fullchain.pem \
  SSL_CERTIFICATE_KEY=/path/to/privkey.pem \
  ./scripts/configure-nginx.sh
```

如果服务器位于中国内地，域名在对外开放前需完成适用的 ICP 备案与接入流程。
