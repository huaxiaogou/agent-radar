# Agent Radar

Agent Radar 是一个面向 AI Coding 与 Agent 工程实践的个人技术情报站。它不做脱离任务条件的模型总分榜或普通新闻聚合，而是把新概念和产品变化还原为来源谱系、工程证据、采用阶段与可执行方法。

## 当前版本

正式版已经接入真实采集与持久化：

- `/today`：今日雷达与证据脉冲。
- `/signals`：去重后的事件簇。
- `/discussions`：合并已发布信号中的社区原文与 LLM 中文编辑成功的 watch 探索脉冲；每条保留原标题、原链和独立热度，始终标记为 community-only / 待溯源。
- `/concepts`：可修订的正式概念索引，以及与正式目录隔离、保留原文的 LLM 待溯源概念候选。
- `/graph`：概念关系图及无障碍文本替代。
- `/models`：定时刷新的数十至上百模型“编程指数 × 单任务成本”全景、8 个重点模型的编辑核验对照，以及定时更新的 7/30 日讨论脉冲。
- `/sources`：同时展示 official/repository/practitioner/community/research 五类发现渠道与官方/实践者/社区三层 Evidence Layer，并区分配置、可用和已产出覆盖。
- `/playbooks`、`/digests`、`/search`：方法库、周报和跨对象搜索。

- 89 个启用的公开 HTTPS、免登录来源：27 个 official、26 个 repository、12 个 practitioner、13 个 community、11 个 research；同一组织或平台共享 `independentGroup`，不会用重复 feed 或同平台讨论伪造跨源验证。
- SQLite 保存原始文章、来源健康度和每次任务结果；页面读取原子 JSON 快照。
- 中英文宽召回、正文补全后二次相关性过滤、URL 去重、eventKey 事件聚类和概念归类。
- DeepSeek 或 OpenAI 对所有通过正文补全与发现阈值的候选执行 publish/watch/reject 判断、相关性/新颖性/证据质量精排，并生成中文编辑标题、摘要和工程解读。原文保持原语言并保留跳转链接；规则分析只用于召回、分类修复和失败审计，不能成为公开卡片正文。`RADAR_MAX_NEW_ITEMS` 只限制最终发布，不会提前截断单一来源的正文补全或 LLM 分析。
- systemd timer 每小时唤醒一次；各来源按 1h/2h/4h/8h/12h/24h cadence 独立判断，单一来源失败不会清空或阻断既有内容。

网站是公开只读访问，不要求登录。采集入口仅存在于服务器脚本和 systemd，不对公网暴露写接口。

`/models` 有三条独立时间轴：全景图的 Coding Index、Intelligence Index 和每任务成本来自 Artificial Analysis 公开模型清单，systemd 默认每 24 小时刷新；下方 8 个重点模型的上下文、API 价格和 1–5 档场景判断是带核验日期与厂商链接的编辑数据；官方、实践者和社区的 7/30 日讨论脉冲随文章采集更新。三者不互相冒充。

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

# 正式公开信号需要配置 DeepSeek 或 OpenAI；Key 只保存在服务器
cp .env.example .env.production
chmod 600 .env.production

# 先验证真实 LLM 请求与中文结构化输出
npm run ai:check

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

# ai:check 固定产生一次小额真实请求；backfill 在没有待处理记录时不调用模型
npm run ai:check
RADAR_BACKFILL_CONCURRENCY=4 npm run editorial:backfill

./scripts/restart.sh
```

如果 `install-scheduler.sh` 本身有更新，再重新执行一次安装脚本。它只会覆盖带有 `# managed-by: agent-radar` 标记的两个 Agent Radar unit。

`stop.sh` 只会终止 PID 文件中且工作目录属于本项目的 Next.js 进程，不会按名称批量终止 Node。`restart.sh` 只负责安全停止、重新构建和启动。

## AI 分析供应商

分析层支持 `deepseek`、`openai`、`rules` 和 `auto`。正式站推荐在服务器 `.env.production` 显式选择 DeepSeek 或 OpenAI；密钥不得提交到 Git。`rules` 仍可用于无模型诊断和保存待回填数据，但其标题、摘要和工程解读不会进入公开信号。

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

`auto` 用于兼容既有部署：优先使用已配置的 OpenAI；没有 OpenAI Key、但存在 DeepSeek Key 时使用 DeepSeek；两个 Key 都没有时使用本地规则。`RADAR_AI_PROVIDER=rules` 或 `RADAR_DISABLE_AI=1` 可以关闭外部模型，但此时新文章只能进入待回填存储，不能生成公开卡片。

每个通过正文补全与发现阈值的候选都会进入配置的 LLM；`RADAR_MAX_NEW_ITEMS` 只限制最终公开数量，不再把超额候选降级为规则文案。模型返回的 `title`、`summary`、`implication` 必须通过中文编辑校验，产品名、框架名、缩写和版本号可以保留原文。无效语言、空内容、无效 JSON、超时或服务异常最多重试一次；最终失败会写入本轮任务错误日志并保持非公开，不落成终态文章，因此下轮扫描仍可重试。

已有 `analysis_mode=rules`，或虽然标记为 DeepSeek/OpenAI 但不符合当前中文编辑门禁的公开文章，不会由普通 URL 去重采集自动覆盖。更新到本版本后执行一次并发、幂等的历史回填：

```bash
npm run ai:check
RADAR_BACKFILL_CONCURRENCY=4 npm run editorial:backfill
```

回填只选择所有未通过当前 `isLlmEditorialReady` 门禁的公开历史记录，包括 `rules` 和不合格的旧 DeepSeek/OpenAI 结果；已经合格的中文 LLM 记录不会重新消费。任务直接读取 SQLite 中保存的原始标题、摘要和正文，不重新抓取网页，不限制总条数。每篇成功后只条件更新中文标题、中文摘要、工程解读和实际分析供应商；URL、原始语言内容、内容哈希、来源、聚类、分类、分数和发布状态保持不变。单篇失败不会覆盖旧记录，命令返回非零且不替换线上快照；再次执行只处理剩余不合格项目。回填与定时采集共用同一把进程锁，不能并行运行。

快照写入入口还会检查全库公开记录：只要仍有一条 rules 或未通过中文校验的公开记录，回填、手工采集和 systemd 采集都不能替换旧快照。只有 backlog 归零后才会一次性切换完整结果，避免部分回填结果被下一轮定时任务提前发布。合法采集如果暂时只有 watch/reject、没有公开文章，可以保存 seed 状态，但缺失、损坏或 seed 快照在运行期都会失败关闭为 0 条公开信号，不会回退展示内置示例卡片；`start.sh` 和 `restart.sh` 仍要求非空真实数据与合法 live snapshot。

配置完成后可执行一次小额真实请求验证 Key、模型和结构化输出；命令不会打印密钥或分析正文：

```bash
npm run ai:check
```

## 自动采集原理

`agent-radar-ingest.timer` 每小时触发一次独立的 oneshot 服务。每次运行依次完成：

1. 从 `config/sources.json` 读取正式来源注册表。
2. 并发抓取 RSS/Atom、公开 JSON API、GitHub Releases 和经过 URL 白名单约束的 HTML 页面；每次 HTTPS 请求都会拒绝内网/元数据地址和非安全重定向，并把已验证的 DNS 地址固定到实际 TLS 连接以阻断 DNS rebinding。
3. 进行中英文宽召回，按来源轮询顺序对全部未见候选补全正文并做二次相关性检查；固定工程词决定语义相关性。高互动且七天内、时间有效的社区/仓库候选只通过独立 exploration gate 进入 LLM 中文编辑，互动量不会进入模型输入；若它的规则相关性低于发现阈值，模型即使返回 publish 也会被确定性降为 watch，reject 则保持终态。发布上限不会提前截断正文补全或 LLM 分析，社区重复不能自行升级为高置信。
4. 所有通过正文补全与发现阈值的候选都由 `RADAR_AI_PROVIDER` 指定的 DeepSeek Chat Completions 或 OpenAI Responses API 生成 publish/watch/reject 决策和中文编辑结果，再按 eventKey、版本和概念边界聚类。模型最终失败只记录任务错误且不落成公开文章，下轮扫描可继续重试；证据不足的新概念候选会隔离保存，等待后续溯源，不参与公开信号与正式概念排序。
5. 在 `.data/agent-radar.sqlite` 中提交文章、来源健康度和任务记录。
6. 按独立 cadence 刷新 Artificial Analysis 公开模型清单，解析编程指数、通用智能指数与每任务成本。只有结构完整且数量不低于安全阈值才原子替换 SQLite 中的上次模型快照；失败只记录错误。
7. 生成 `.data/radar-snapshot.json` 临时文件，完整写入并同步后原子替换线上快照。

systemd 每小时唤醒一次采集服务；每个文章来源再按 `config/sources.json` 的 1h/2h/4h/8h/12h/24h cadence 判断是否到期，模型全景默认按 `RADAR_MODEL_LANDSCAPE_CADENCE_HOURS=24` 刷新。手工执行 `npm run ingest` 会忽略两类 cadence，立即扫描全部启用来源并刷新模型全景。

来源按 `primary → catalog fallbacks → operator relay` 严格串行尝试。内置备用端点只使用同一组织的官方入口或同一社区自己的域名；所有 HTTP 200 但解析为 0 条的响应默认记录为 `EMPTY_RESULT` 并继续下一端点，只有显式 `allowEmpty` 的来源可把空结果视为成功。CrewAI、OpenHands 等目录页使用文章路径白名单，Microsoft、Vercel、LangChain 使用仍可用的官方 feed；原 OpenReview challenge 入口已停用并由 DBLP JSON 检索替代。

中国大陆服务器建议在 `.env.production` 使用：

```dotenv
RADAR_SOURCE_CONCURRENCY=2
RADAR_FETCH_TIMEOUT_MS=30000
```

如果自有海外或企业出口 relay 可用，可额外配置：

```dotenv
RADAR_FETCH_RELAY_TEMPLATE=https://relay.example/fetch?target={url}&token=仅保存在服务器的令牌
```

relay 必须使用 HTTPS、不能在 URL authority 中携带用户名/密码，并且模板必须恰好包含一个 `{url}`。它只会在所有直接端点失败后启用，程序会编码目标 URL；relay 需要原样转发响应 body、HTTP 状态和 `Content-Type`。不要使用不可控的公共代理。采集日志只记录已脱敏的 host/path、底层错误码和 HTTP 状态，不打印来源 query、relay query 或 URL 凭据。

可选的 `GITHUB_TOKEN` 只用于 primary 直连且主机精确为 `api.github.com` 的请求，以提升公开 API 限额。程序不会把它发送到 GitHub 网页、catalog fallback、operator relay 或跨域重定向目标，也不会写入日志。Key 只保存在服务器 `.env.production`。

来源状态区分三种口径：`healthySourceCount` 只统计 primary 直连正常，`degradedSourceCount` 单列备用端点或 relay 可用，`availableSourceCount` 是两者之和。备用成功仍把本轮标为 `partial`，`/sources` 显示“降级”而不是“正常”，同时更新该来源的最后成功时间并保留主端点失败诊断。

`sourceCoverage` 按采集通道 family 与 Evidence Layer 分组报告 `configured / available / effective`，另以 `independentGroup` 去重展示独立来源组：configured 是启用目录数量，available 是本轮仍正常或降级可用的来源，effective 是当前公开 signals 或 discussion pulses 实际出现过的 source id。`/discussions` 的热度由互动量、新鲜度、讨论速度和独立来源广度组成，只用于发现排序；community-only 项无论多热都保持“待溯源”。

采集进程拿到独占任务锁后、创建新 run 之前，会把此前因进程中断而遗留的 `running` 记录幂等收敛为 `failed`。普通网站进程仅打开 SQLite 时不会执行该修复，真实运行中的任务也不会被误判。

网站只读取最后一份完整快照。所有来源同时失败、进程中断或新快照写入失败时，旧快照保持不变。

常用运维命令：

```bash
# 手工补跑
npm run ingest

# 一次性或可恢复地补齐历史中文 LLM 编辑
RADAR_BACKFILL_CONCURRENCY=4 npm run editorial:backfill

# 查看网站当前数据状态
npm run radar:status
curl http://127.0.0.1:3002/api/status

# 查看定时器和采集日志
systemctl list-timers agent-radar-ingest.timer
sudo journalctl -u agent-radar-ingest.service -n 100 --no-pager
```

状态接口会分开报告三个分析口径：`configuredProvider` 是当前运行配置解析出的供应商，`runAnalysisMode` 是最近一轮实际处理文章所使用的模式（没有文章进入分析时为 `none`），`analysisMode` 保留为当前历史文章语料中的分析模式，供旧客户端兼容。三者不能互相替代。

Nginx 脚本只管理带有 `# managed-by: agent-radar` 标记的 `radar.jayjp.com` 配置；如果发现同名域名已经由其他配置处理，会直接退出。它会先执行 `nginx -t`，验证失败时恢复原文件，并且不会修改 `agent.jayjp.com` 或 `lona.jayjp.com`。

如果证书未出现在现有 Nginx 配置中，可显式传入证书路径：

```bash
sudo env SSL_CERTIFICATE=/path/to/fullchain.pem \
  SSL_CERTIFICATE_KEY=/path/to/privkey.pem \
  ./scripts/configure-nginx.sh
```

如果服务器位于中国内地，域名在对外开放前需完成适用的 ICP 备案与接入流程。
