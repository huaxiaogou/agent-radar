# Agent Radar

Agent Radar 是一个面向 AI Coding 与 Agent 工程实践的个人技术情报站。它不做模型跑分或普通新闻聚合，而是把新概念和产品变化还原为来源谱系、工程证据、采用阶段与可执行方法。

## 当前版本

正式版已经接入真实采集与持久化：

- `/today`：今日雷达与证据脉冲。
- `/signals`：去重后的事件簇。
- `/concepts`：可修订的概念索引与分析页。
- `/graph`：概念关系图及无障碍文本替代。
- `/sources`：首批来源注册与采集优先级。
- `/playbooks`、`/digests`、`/search`：方法库、周报和跨对象搜索。

- 16 个首批来源，覆盖 RSS/Atom、GitHub Releases 和无 Feed 页面发现。
- SQLite 保存原始文章、来源健康度和每次任务结果；页面读取原子 JSON 快照。
- 关键词相关性过滤、URL 去重、近似事件聚类和概念归类。
- 无密钥即可使用规则分析；可选择 DeepSeek 或 OpenAI 生成结构化中文工程分析，单篇失败自动降级。
- systemd timer 每 4 小时采集，单一来源失败不会清空或阻断既有内容。

网站是公开只读访问，不要求登录。采集入口仅存在于服务器脚本和 systemd，不对公网暴露写接口。

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
2. 并发抓取 RSS/Atom、GitHub Releases 和 HTML 页面。
3. 过滤非 AI Coding/Agent 工程内容，并按 URL、版本和标题相似度去重聚类。
4. 按 `RADAR_AI_PROVIDER` 使用 DeepSeek Chat Completions、OpenAI Responses API 或本地规则生成结构化分析；外部模型失败自动回退规则。
5. 在 `.data/agent-radar.sqlite` 中提交文章、来源健康度和任务记录。
6. 生成 `.data/radar-snapshot.json` 临时文件，完整写入并同步后原子替换线上快照。

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
