# Agent Radar

Agent Radar 是一个面向所有高级 AI Coding 工程师的通用前沿知识雷达。它不做脱离任务条件的模型总分榜或普通新闻聚合，而是把新概念和产品变化还原为来源谱系、工程证据、知识生命周期、工程机制与可复核修订；具体团队如何映射和落地，由工程师结合自身约束判断。

## 当前版本

正式版已经接入真实采集与持久化：

- `/today`：今日雷达与证据脉冲。
- `/signals`：去重后的事件簇。
- `/discussions`：合并已发布信号中的社区原文与 LLM 中文编辑成功的 watch 探索脉冲；每条保留原标题、原链和独立热度，始终标记为 community-only / 待溯源。
- `/concepts`：由 SQLite 权威知识版本驱动的工程知识库。正式概念与候选隔离，主张就地绑定原始证据，保留别名、受控工程主题、机制、模式、边界、失败、争议、关系与修订历史；首页按上海自然日生成“今日新增、实质修订、本周升温、争议、学习优先”五类学习队列，每类最多三项且不拿候选、归档或陈旧历史热度填位；候选使用稳定站内详情页公开证据层、独立来源和晋级缺口；旧静态快照缺少知识协议标识时会失败关闭，不会冒充动态知识。
- `/graph`：概念关系图及无障碍文本替代。
- `/models`：定时刷新的数十至上百模型“编程指数 × 单任务成本”全景、8 个重点模型的编辑核验对照，以及定时更新的 7/30 日讨论脉冲。
- `/sources`：同时展示 official/repository/practitioner/community/research 五类发现渠道与官方/实践者/社区三层 Evidence Layer，并区分配置、可用和已产出覆盖。
- `/playbooks`、`/digests`、`/search`：方法库、周报和跨对象搜索。

- 90 个启用的公开 HTTPS、免登录来源：28 个 official、26 个 repository、12 个 practitioner、13 个 community、11 个 research；同一组织或平台共享 `independentGroup`，不会用重复 feed 或同平台讨论伪造跨源验证。长内容职责显式覆盖播客文字稿、访谈和工程复盘，GitHub Engineering 与 GitHub 其他通道仍共享同一个独立来源组。
- SQLite 保存原始文章、来源健康度和每次任务结果；页面读取原子 JSON 快照。
- 中英文宽召回、正文补全后二次相关性过滤、URL 去重、eventKey 事件聚类和动态概念发现。详情正文失败时会保留 feed 摘要继续降级分析，但 item、来源和本轮任务都会显式标记为 degraded/partial，记录脱敏错误码，不会把 excerpt-only 冒充完整正文。高质量官方/实践者材料中的未知 AI Coding 工程术语不受固定概念枚举限制；每篇文章最多提取 3 个独立概念证据增量，并在写入前以 `reuse-existing / create-new / needs-review` 身份裁决完成别名归一、复用或候选隔离。普通版本更新或证据不足的材料允许明确产出 0 个概念，避免为了填满协议虚构知识。
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

# 首次部署必须复用现有 SQLite 历史文章建立概念知识；可中断、续跑且内容哈希未变时不重复消费
RADAR_CONCEPT_BACKFILL_CONCURRENCY=4 npm run concepts:backfill
npm run concepts:check

./scripts/restart.sh
sudo ./scripts/configure-nginx.sh
sudo ./scripts/install-scheduler.sh
```

若 root/sudo 的 `secure_path` 找不到已经安装在 `/usr/local/bin` 的 Node，可显式传入经过校验的绝对可执行路径：

```bash
sudo env NODE_BIN=/usr/local/bin/node ./scripts/install-scheduler.sh
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
RADAR_CONCEPT_BACKFILL_CONCURRENCY=4 npm run concepts:backfill
npm run concepts:check

./scripts/restart.sh
```

如果 `install-scheduler.sh` 本身有更新，再重新执行一次安装脚本。它只会覆盖带有 `# managed-by: agent-radar` 标记的两个 Agent Radar unit。

`stop.sh` 只会终止 PID 文件中且工作目录属于本项目的 Next.js 进程，不会按名称批量终止 Node。`restart.sh` 会先执行文章编辑与概念知识双重 readiness 门禁；只有真实数据库和 live snapshot 就绪后，才会安全停止、重新构建并启动。门禁失败时不会触碰当前服务进程。

本版本要求快照携带 `knowledgeSchemaVersion=1`。因此升级后必须先完成 `concepts:backfill`、`concepts:check` 并生成新快照，再重启网站；旧的通用 `version=1` 静态概念快照会被运行时拒绝。

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

### 概念知识分析与历史回溯

信号编辑和概念知识综合是两条不同但相连的 LLM 链：前者判断单篇文章是否发布，后者把已入库文章沉淀为可修订的工程知识对象。概念链只使用 SQLite 中保存的正文和明确允许的原始 URL，文章内容始终按不可信输入处理；来源声明的 `contentRoles` 会经过白名单验证后随文章持久化，并把当前受控的“播客文字稿、访谈、工程复盘”职责送入概念 LLM，而不是靠来源名称猜测长文用途。模型现在只负责从单篇文章提取最多 3 个紧凑的概念身份、中文知识增量和原子主张；证据 URL、原标题、来源身份、字段引文、生命周期和已有关系均由本地系统从权威文章与最后有效知识中确定性组装。无证据字段保持真正空值，普通版本更新可以返回 0 个概念并记为已完成。最终对象仍必须通过严格 JSON、中文、受控主题、身份裁决、证据绑定和正式概念公开质量门禁；伪造 URL、英文核心知识和无证据内容不会放行。单篇失败默认最多重试三次，并只向模型反馈固定错误类别与安全字段名，不回灌原始模型值。整篇结果在同一 SQLite 事务内全部验证与追加，任何一个输出无效都会回滚全部概念并保留各自最后有效版本。供应商、模型、分析器版本与身份裁决会进入追加式修订和回填审计。

正常 `npm run ingest` 会把本轮新文章优先交给概念链；新增和历史重试共同受 `RADAR_CONCEPT_INCREMENTAL_BATCH_SIZE` 单轮总预算约束，默认 20。只有新文章使用后剩余的额度才能用于历史记录，并继续受 `RADAR_CONCEPT_RETRY_BATCH_SIZE` 子上限约束，默认 4。当前内容哈希从未处理的 pending 优先于已失败记录；已经 completed 但知识 Schema 或分析器版本落后的历史记录也会重新进入这个有界队列；失败记录按最早尝试时间轮转，因此永久失败既不会饿死新 backlog，也不能突破总预算。不需要增加第二个 systemd timer。概念失败不会回滚已经完成的文章采集，也不会覆盖最后有效知识，但会把本轮标成 `partial` 并计入 `errorCount`。运行结果中的 `conceptUpdatedCount`、`conceptSkippedCount`、`conceptFailureCount` 分别表示本轮知识修订、幂等跳过和失败数量。

版本升级后的日常定时采集会渐进补偿旧版本记录，但它受每轮增量预算限制。首次上线或分析协议大版本升级仍应主动执行下面的 `concepts:backfill`，以便在一次可恢复任务中及时清空历史 backlog，而不是等待多轮定时任务慢慢追平。

首次上线或知识协议升级后，执行历史全量回溯：

```bash
# 默认每批 20 篇、批内并发 4；命令会连续跑完全部批次并在成功后原子发布快照
RADAR_CONCEPT_BACKFILL_BATCH_SIZE=20 \
RADAR_CONCEPT_BACKFILL_CONCURRENCY=4 \
npm run concepts:backfill

# 检查正式概念、候选、修订、证据、主张以及仍待处理/失败的文章
npm run concepts:check
```

正常回溯以 `article URL + input contract hash + knowledge schema version + analyzer version` 作为幂等边界；输入契约哈希稳定覆盖正文 `content_hash` 与白名单归一后的 `contentRoles`。因此正文、播客/访谈/复盘职责、知识协议或分析器任一变化都会重新处理一次，而顺序、重复或未知角色不会制造伪变化。提交 CAS 会再次核对正文与职责，分析期间发生变化只留下可重试 conflict，不提交陈旧知识。任务按批提交，可在中断后再次执行。每篇开始与完成都会即时输出 `batch/article/status/elapsedMs/errorCategory`；只有真正占用模型 worker 的记录标记为 `running`，已领取但排队的记录只持有 lease。任一坏输入，或全部候选正被有效 lease 占用而导致某批零进展时，命令会在单批后以 `partial` 非零退出且不替换公开快照，避免空转一万批；修复模型输出或等待 lease 到期后直接重跑即可。可用 `--batch-size`、`--concurrency`、`--max-batches` 覆盖默认值；重复传入 `--url <article-url>` 会强制定向重分析全部指定文章，即使数量跨越多个批次也不会恢复 completed skip，但仍遵守 lease、事务和 CAS 门禁。

`concepts:check` 不只统计数量。它会检查 current payload 是否可从 append-only revision 恢复、正式概念的公开 publish evidence、主张证据和所有非空知识字段引用。完全健康输出 `ok`；从 last-good 恢复但需要修复 current payload 时输出 `warning` 且退出码仍为 0；不可恢复损坏、公开质量失败、pending、failed 或没有正式概念时输出 `not-ready` 并非零退出。状态中的 `recentFailures` 最多列出 10 条当前输入契约下最新的 failed/conflict 文章，只含去掉 query/fragment 的 HTTPS host+path、状态、尝试时间和固定枚举 `errorCategory`；旧正文、旧角色、旧分析器失败不会混入，CLI、pipeline、快照和 `/api/status` 也不会回显模型原文、URL 凭据或密钥。回填 CLI 的 `failures` 同样携带安全类别，例如 `relation-contract`、`chinese-editorial`、`evidence-contract`、`schema-contract`、`theme-contract` 或 `invalid-json`，无需直接查询数据库 `last_error`。

确认两个概念实际上是同一知识对象后，用显式人工命令合并，原因必须包含中文说明：

```bash
npm run concepts:merge -- \
  --from legacy-concept-slug \
  --into canonical-concept-slug \
  --reason "名称不同，但机制、边界和证据已经归一"
```

合并会在规范概念上追加一个 `system-merge / concept-merge-v1` 修订，折叠仍有效的主张、证据和字段引文，再保存旧别名与永久重定向并原子发布新快照。参数校验发生在打开数据库和获取任务锁之前；失败不会替换公开快照。

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
5. 对本轮成功入库的 URL 执行增量概念知识分析：从固定清单之外发现新概念，一篇材料可提取多个独立概念；模型先对照已有规范名、别名、定义和机制执行身份裁决，再抽取主张、受控主题、绑定证据、保留冲突并追加版本。LLM 不能自行用热度晋升成熟度，本地生命周期规则会按独立来源重新裁决；失败保留 last-good 知识。
6. 在 `.data/agent-radar.sqlite` 中提交文章、概念知识版本、来源健康度和任务记录。
7. 按独立 cadence 刷新 Artificial Analysis 公开模型清单，解析编程指数、通用智能指数与每任务成本。只有结构完整且数量不低于安全阈值才原子替换 SQLite 中的上次模型快照；失败只记录错误。
8. 生成 `.data/radar-snapshot.json` 临时文件，完整写入并同步后原子替换线上快照。

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

# 一次性或可恢复地复用历史文章生成/修订概念知识，并检查是否就绪
RADAR_CONCEPT_BACKFILL_CONCURRENCY=4 npm run concepts:backfill
npm run concepts:check

# 查看网站当前数据状态：分别输出 snapshotStatus、conceptKnowledgeStatus 与模型全景状态
npm run radar:status
curl http://127.0.0.1:3002/api/status

# 查看定时器和采集日志
systemctl list-timers agent-radar-ingest.timer
sudo journalctl -u agent-radar-ingest.service -n 100 --no-pager
```

`sudo systemctl start agent-radar-ingest.service` 只是立即唤醒一次 cadence-aware 定时链，只处理已经到期的来源；`npm run ingest` 才会跳过来源和模型 cadence，强制扫描全部启用来源。两者不要混用。

首次回填或知识协议升级不能只看命令退出码。发布前必须在真实生产数据上完成一次人工内容抽检：

1. 随机阅读至少 10 个正式概念详情，确认定义、机制、实现模式、边界、失败模式与争议不是通用填充语句。
2. 阅读至少 10 个候选，确认它们与正式概念隔离，晋级缺口、独立来源和 watch 证据真实可追溯。
3. 抽查至少 5 篇产生多个概念的文章，确认身份裁决没有拆出同义概念或覆盖既有 dossier。
4. 对每个样本点击主张、字段和关系旁的原始链接，核对原标题、来源组织、证据立场及同组织去重。
5. 检查至少 5 组修订前后差异，确认“今日实质修订”和“本周升温”来自真实 material revision/heat 正增量，而不是更新时间或当前高热。
6. 检查 `npm run concepts:check`、`npm run radar:status` 与 `/api/status`；`pendingArticleCount`、`failedArticleCount`、`recentFailures` 和损坏计数必须与本次发布决定一致。
7. 若任一样本出现英文拼接、伪造起源、空洞机制、无证据结论或错误合并，停止发布，定向修复/重跑对应 URL 后重新抽检。

状态接口会分开报告三个分析口径：`configuredProvider` 是当前运行配置解析出的供应商，`runAnalysisMode` 是最近一轮实际处理文章所使用的模式（没有文章进入分析时为 `none`），`analysisMode` 保留为当前历史文章语料中的分析模式，供旧客户端兼容。三者不能互相替代。

Nginx 脚本只管理带有 `# managed-by: agent-radar` 标记的 `radar.jayjp.com` 配置；如果发现同名域名已经由其他配置处理，会直接退出。它会先执行 `nginx -t`，验证失败时恢复原文件，并且不会修改 `agent.jayjp.com` 或 `lona.jayjp.com`。

如果证书未出现在现有 Nginx 配置中，可显式传入证书路径：

```bash
sudo env SSL_CERTIFICATE=/path/to/fullchain.pem \
  SSL_CERTIFICATE_KEY=/path/to/privkey.pem \
  ./scripts/configure-nginx.sh
```

如果服务器位于中国内地，域名在对外开放前需完成适用的 ICP 备案与接入流程。
