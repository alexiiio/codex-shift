# Codex Shift

<p align="center">
  <a href="README.md">English</a> | <strong>简体中文</strong>
</p>

OpenAI Codex CLI 的跨平台多账号切换工具。

**切换账号，不改变你的工作流。**

> Codex Shift 是非官方第三方工具，与 OpenAI 无隶属或官方背书关系。

Codex Shift 会保留现有的 Codex Home，包括配置、MCP 服务、会话和历史记录。它只在本地保存多个登录 profile，并让你选择其中一个作为当前使用的 `~/.codex/auth.json`。

## 安装

### 环境要求

- Node.js 20 或更高版本
- 已安装 [OpenAI Codex CLI](https://developers.openai.com/codex/cli)，并可通过 `codex` 命令调用

### 使用 npm 安装（推荐）

通过 npm 直接从 GitHub 安装最新版本：

```bash
npm install --global https://github.com/alexiiio/codex-shift/archive/refs/heads/main.tar.gz
```

安装完成后，确认命令可以正常调用：

```bash
codex-shift --help
```

### 从源码安装

macOS 和 Linux：

```bash
git clone https://github.com/alexiiio/codex-shift.git
cd codex-shift
./scripts/install.sh
```

Windows PowerShell：

```powershell
git clone https://github.com/alexiiio/codex-shift.git
cd codex-shift
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

源码安装脚本会下载项目依赖、检查并构建源码，然后通过 npm 将 `codex-shift` 命令全局安装到当前系统。

需要更新源码安装版本时，拉取最新代码并重新运行安装脚本即可。

## 快速开始

下面的 `personal` 和 `work` 只是 profile 名称示例，不是固定指令或保留名称。请将它们替换为你自定义的名称。

保存 Codex 当前正在使用的账号：

```bash
codex-shift save personal
```

登录另一个账号，并将它保存为 profile：

```bash
codex-shift login work
```

切换 profile 后，继续正常使用 Codex：

```bash
codex-shift use personal
codex
```

## 命令

| 命令 | 说明 |
| --- | --- |
| `codex-shift login <name>` | 登录 Codex、保存账号并设为当前 profile |
| `codex-shift save <name>` | 保存 Codex 当前正在使用的账号 |
| `codex-shift use <name>` | 切换到已保存的 profile |
| `codex-shift list` | 刷新并列出所有 profile，查询失败时显示缓存数据 |
| `codex-shift current` | 显示当前 profile |
| `codex-shift remove <name>` | 删除一个非当前 profile |
| `codex-shift --help` | 显示命令帮助 |

Profile 名称可以包含英文字母、数字、点、下划线和连字符。

## 账号信息

`codex-shift list` 会刷新每个已保存 profile 的可用账号信息和周额度信息。每次查询都在临时 `CODEX_HOME` 中进行，因此刷新其他账号的信息不会替换当前使用的 `~/.codex/auth.json`。

账号列表可以显示邮箱、订阅类型、周额度剩余量和重置时间。重置时间使用运行 Codex Shift 的本机时区。某个 profile 的实时查询失败时，会改为显示该 profile 之前缓存的信息。

## 存储与安全

账号凭据只保存在本机。不同 profile 的凭据存放在：

```text
~/.codex-accounts/<profile>/auth.json
```

Windows 使用用户主目录下的对应路径。Codex Shift 不会主动打印认证 token；账号查询创建的临时目录会在每次查询结束后删除。

## 开发

```bash
npm install
npm run check
npm run build
node dist/cli.js --help
```

GitHub Actions 会在 macOS、Windows 和 Linux 上，分别使用 Node.js 20 和 22 进行检查和构建。

## License

MIT
