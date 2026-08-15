# 部署文件

- `compose.dev.yaml`：仅启动本地开发所需的 PostgreSQL，使用合成开发凭据。
- `compose.design.yaml`：NAS 生产部署草案，镜像发布完成前请勿用于生产环境。

本地数据库启动：

```bash
docker compose -f deploy/compose.dev.yaml up -d
```

正式部署文档见 [../docs/08-nas-deployment.md](../docs/08-nas-deployment.md)。
