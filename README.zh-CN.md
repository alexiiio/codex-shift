# Codex Shift

<p align="center">
  <a href="README.md">English</a> | <strong>简体中文</strong>
</p>

OpenAI Codex CLI 的跨平台多账号切换工具。

**切换账号，不改变你的工作流。**

> Codex Shift 是非官方第三方工具，与 OpenAI 无隶属或官方背书关系。

## 功能说明

Codex Shift 会保留你现有的 Codex Home，不改变配置、MCP 服务、会话、历史记录以及原本的 Codex 命令；它只负责在本地保存多个登录账号，并选择其中一个作为默认的 `~/.codex/auth.json`。

## 使用方式

```bash
# 保存 Codex 当前已经登录的账号
codex-shift save personal

# 登录另一个账号并保存
codex-shift login work

# 快速查看本地账号列表（使用缓存的账号信息）
codex-shift list

# 刷新所有已保存账号的订阅和周额度
codex-shift status

# 切换默认账号
codex-shift use work

# 查看当前默认 profile
codex-shift current

# 删除一个非当前账号
codex-shift remove personal
```

切换完成后，Codex 的使用方式完全不变：

```bash
codex
codex resume
codex exec "..."
```

## 为什么默认不占用 `codex account`？

Codex Shift 将独立的 `codex-shift` 命令作为稳定的公共接口。未来 OpenAI Codex 可能增加自己的 `codex account` 子命令，用户本地的其他工具也可能包装或拦截 `codex` 可执行文件。

因此，Codex Shift 默认**不会覆盖或替换原生 `codex` 命令**。未来可以提供可选兼容层，但只有在确认不会覆盖原生命令时才启用。

这样可以确保 `codex resume` 等命令始终保持原生行为，并降低与当前或未来 Codex 功能冲突的风险。

## 账号状态

`codex-shift status` 使用 Codex 的结构化 `app-server` 账号接口，而不是解析交互式 `/status` 页面文本。

查询每个已保存账号时，Codex Shift 会创建一个临时 `CODEX_HOME`，因此查看其他账号状态不会替换用户当前正在使用的 `~/.codex/auth.json`。

状态列表可以显示：

- ChatGPT 账号邮箱
- 订阅类型，例如 Plus、Pro
- 周额度剩余量
- 周额度重置时间

如果实时查询失败，之前缓存的账号信息仍可通过 `codex-shift list` 查看。

## 开发环境

要求：

- Node.js 20+
- 已安装 OpenAI Codex CLI，并且可以通过 `codex` 命令调用

```bash
npm install
npm run check
npm run build
node dist/cli.js --help
```

## 平台支持

核心 CLI 使用 TypeScript / Node.js 编写，目标支持：

- macOS
- Windows
- Linux

GitHub Actions 会在上述三个操作系统上分别使用 Node.js 20 和 22 运行 CI。

## 安全性

所有账号凭据只保存在本机。Codex Shift 会将不同 profile 的凭据保存到：

```text
~/.codex-accounts/<profile>/auth.json
```

Windows 上则使用对应的用户主目录路径。

Codex Shift 不会主动打印认证 token。

实时状态查询时，会把对应 profile 的凭据复制到临时 Codex Home，查询完成后删除临时目录。

## 项目状态

当前 MVP 已包含：

- profile `save`
- profile `login`
- profile `use`
- 本地 `list`
- 实时 `status`
- `current`
- `remove`
- Codex app-server 结构化账号和 rate-limit 查询
- macOS / Windows / Linux CI

第一个稳定版本之前还计划完成：

- 多账号修改时的文件锁和并发保护
- 自动化测试
- 完善 npm 安装和发布流程
- 可选且避免冲突的 `codex account ...` 兼容层

## License

MIT
