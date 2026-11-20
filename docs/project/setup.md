# 本机部署与操作

## 运行前准备

安装 Node.js 22、pnpm 9.15.9、带 pgvector 的 PostgreSQL，以及 Redis 7 或兼容服务。创建空数据库和专用用户，赋予运行迁移所需权限。独立配置数据库地址、队列地址和密钥。

1. 复制本目录的 `api.env.example` 到仓库里的 `apps/api/.env`，填写数据库、Redis 和密钥。分别执行两次 `node -p "require('node:crypto').randomBytes(48).toString('hex')"`，将结果分别用于 `JWT_SECRET_KEY` 和 `HASH_PEPPER`。
2. 将同一份 `DATABASE_URL` 写入 `libs/database/.env`，供 Prisma 使用。在 `apps/web/.env.local` 设置 `VITE_API_BASE_URL=http://127.0.0.1:3000`。
3. 在仓库根目录执行安装、迁移和构建命令。

```sh
pnpm install --frozen-lockfile
pnpm --filter @openathlete/database db:generate
pnpm --filter @openathlete/database db:deploy
pnpm --filter @openathlete/shared build
pnpm --filter @openathlete/api build
```

在两个终端分别运行服务。

```sh
pnpm --filter @openathlete/api start:prod
```

```sh
pnpm --filter @openathlete/web dev --host 127.0.0.1 --port 8766 --strictPort
```

打开 <http://127.0.0.1:8766> 并注册测试账号。API 健康检查位于 <http://127.0.0.1:3000/health>。

## 体验主要功能

- 在「设置 → 连接器」导入本目录的 `demo-run-10k.tcx`。合成活动日期为 2026-11-20（北京时间）。也可以在此页绑定本人的 Garmin Connect 中国区个人 API。
- 在「AI 教练 → 跑后反馈」选中活动日期，输入“这次跑了 10 公里，很累，RPE 8”，确认活动后保存。
- 在「AI 教练 → 教练对话」聊训练与恢复。点「历史对话」可以重开旧会话。清理网站数据会同时移除当前浏览器的历史。
- 使用本机模型时，在 Ollama 安装 `qwen3:4b`，使服务监听 `127.0.0.1:11434`，在 API 配置里将 `AI_LOCAL_OLLAMA_ENABLED` 设为 `true` 后重启。之后在网页选择模型并开启 AI 数据处理许可。

## Docker 自建入口

在仓库根目录根据 `.env.example` 设置独立密钥，设定 `APP_URL=http://127.0.0.1:8766`、`WEB_PORT=127.0.0.1:8766`、`GARMIN_PERSONAL_API_ENABLED=true` 和 `GARMIN_PERSONAL_API_REGION=cn`。用以下命令从当前源码构建。

```sh
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

本次在 Windows 本机运行方式下验收。Docker 方案有待在独立电脑上验证。
