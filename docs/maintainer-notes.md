# Codex Shift 维护者说明

本文档记录不需要出现在公开 README 主流程中的设计背景和项目进度。

## CLI 命名空间策略

Codex Shift 使用独立的 `codex-shift` 命令作为稳定公共接口，不覆盖或替换原生 `codex` 命令。

采用独立命令的原因：

- 避免与 Codex 当前或未来可能提供的 `codex account` 子命令冲突。
- 避免与用户本地已有的 `codex` 包装脚本或代理工具冲突。
- 保证 `codex resume`、`codex exec` 等命令继续由原生 Codex CLI 处理。

未来可以评估可选的 `codex account ...` 兼容层，但启用前必须确认不会遮蔽原生命令。

## 账号状态实现

`codex-shift list` 使用 Codex 的结构化 `app-server` 账号接口，而不是解析交互式 `/status` 文本。查询每个 profile 时会创建临时 `CODEX_HOME`，避免替换用户当前使用的认证文件；单个 profile 实时查询失败时显示之前缓存的账号信息。重置时间通过 `Intl.DateTimeFormat` 使用本机时区格式化。

## 项目进度

当前 MVP 已包含：

- profile `save`
- profile `login`
- profile `use`
- 联网刷新并支持缓存回退的 `list`
- `current`
- `remove`
- Codex app-server 结构化账号和 rate-limit 查询
- macOS、Windows、Linux CI
- 从源码安装脚本

首个稳定版本前计划完成：

- 为并发账号修改增加文件锁和并发保护
- 增加自动化测试
- 完善 npm 发布流程
- 评估可选且无冲突的 `codex account ...` 兼容层

## 分发策略

面向用户的安装方式按以下优先级维护：

1. 发布到 npm registry 后，以 `npm install --global codex-shift` 作为首选方式。
2. npm 正式发布前，使用 `npm install --global https://github.com/alexiiio/codex-shift/archive/refs/heads/main.tar.gz` 从 GitHub tarball 安装。
3. 源码安装脚本作为需要检查或修改源码时的备用方式。

Homebrew 官方仓库当前没有 Codex Shift formula。稳定发布并建立版本化归档后，可以选择维护独立 tap，或在符合要求时向 `homebrew-core` 提交 formula。

GitHub tarball 安装直接使用仓库中已构建的 `dist`，避免在 npm 的临时 Git 环境中依赖 TypeScript 编译器。不要使用 `github:alexiiio/codex-shift` Git 依赖语法；npm 10 的全局安装可能留下指向已删除临时缓存的软链接。修改源码后必须运行 `npm run build`，并将对应的 `dist` 更新一同提交。

## 本地开发与验证

```bash
npm install
npm run check
npm run build
node dist/cli.js --help
```

GitHub Actions 在 macOS、Windows 和 Linux 上，分别使用 Node.js 20 和 22 进行检查和构建。交互式列表还应在真实 TTY 中验证方向键、二次确认、刷新、退出、Ctrl+C、窗口缩放，以及管道和重定向时的非交互降级。
