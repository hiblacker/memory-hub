# 部署文件

- `compose.dev.yaml`：仅启动本地开发所需的 PostgreSQL，使用合成开发凭据。
- `compose.design.yaml`：NAS 生产部署草案，镜像发布完成前请勿用于生产环境。

本地数据库启动：

```bash
docker compose -f deploy/compose.dev.yaml up -d
```

正式部署文档见 [../docs/08-nas-deployment.md](../docs/08-nas-deployment.md)。

## Compose project naming

Always start this stack from the MemoryHub repo with an explicit project identity:

```bash
docker compose -f deploy/compose.dev.yaml up -d
```

`compose.dev.yaml` sets `name: memory-hub` and `container_name: memory-hub-postgres-dev`.
The Postgres volume is fixed as `memory-hub_postgres_data`.

Do **not** run `docker compose` from a generic `deploy/` directory of another project without its own `name:`, or containers like `deploy-postgres-1` will collide across repos.

Legacy volume `deploy_memoryhub-postgres-dev` may still exist after earlier runs; current dev stack uses `memory-hub_postgres_data`.

