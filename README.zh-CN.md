# Codex Shift

<p align="center">
  <a href="README.md">English</a> | <strong>简体中文</strong>
</p>

OpenAI Codex CLI 的跨平台账号切换与周额度窗口初始化工具。

**切换账号，启动周额度窗口，不改变你的工作流。**

> Codex Shift 是非官方第三方工具，与 OpenAI 无隶属或官方背书关系。

核心功能包括：

- **切换账号：** 在本地保存多个 Codex 登录 profile，查看账号和周额度信息，并选择当前使用的账号。
- **启动周额度窗口：** 检测尚未开始计算周额度的已保存账号，仅在用户确认后发送一次刻意精简的 Codex 请求来启动窗口。

两个功能都会保留现有的 Codex Home，包括配置、MCP 服务、会话和历史记录。账号切换只替换当前使用的 `~/.codex/auth.json`；周额度初始化则在隔离的临时环境中运行。

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

查看账号信息，并通过交互列表切换 profile：

```bash
codex-shift list
```

列表会刷新每个 profile 的账号、订阅类型、周额度和重置时间。使用方向键选择账号，按 Enter 后确认切换；`*` 标识 Codex 当前正在使用的账号。

启动尚未开始计算的周额度窗口：

```bash
codex-shift init-week
```

Codex Shift 会检测符合条件的账号，并在为每个账号发送一次最小请求前要求确认。选择取消不会消耗额度。该请求刻意设计得远小于普通编程任务：只要求回复 `OK`，不携带项目上下文和历史会话，并选择成本最低的可用模型及推理强度。具体说明请参阅[启动尚未使用的周额度窗口](#启动尚未使用的周额度窗口)。

你也可以通过 profile 名称直接切换，然后继续正常使用 Codex：

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
| `codex-shift list` | 刷新 profile，并通过交互列表选择要切换的账号 |
| `codex-shift init-week` | 通过一次最小 Codex 请求启动尚未开始的周额度窗口 |
| `codex-shift current` | 显示当前 profile |
| `codex-shift remove <name>` | 删除一个非当前 profile |
| `codex-shift --help` | 显示命令帮助 |

Profile 名称可以包含英文字母、数字、点、下划线和连字符。

## 账号信息

`codex-shift list` 会刷新每个已保存 profile 的可用账号信息和周额度信息。每次查询都在临时 `CODEX_HOME` 中进行，因此刷新其他账号的信息不会替换当前使用的 `~/.codex/auth.json`。

账号列表可以显示邮箱、订阅类型、周额度剩余量和重置时间。重置时间使用运行 Codex Shift 的本机时区。如果尚未使用的周额度窗口返回了一个随查询时间向后移动的重置时间，Codex Shift 会显示 `Not started`，而不是显示这个动态时间。某个 profile 的实时查询失败时，会改为显示该 profile 之前缓存的信息。

在交互式终端中，`>` 表示当前选择，`*` 表示当前正在使用的 profile。使用方向键选择 profile，按 Enter 进入下一步，然后在确认界面选择 `Confirm switch` 或 `Cancel`；默认选中 `Confirm switch`。按 `R` 重新刷新，按 `Q` 或 Esc 退出。输出被重定向或通过管道传递时，`list` 会打印非交互表格并退出。

### 启动尚未使用的周额度窗口

部分账号只有在发出第一条 Codex 请求后才会开始计算周额度窗口。运行：

```bash
codex-shift init-week
```

Codex Shift 会对每个 profile 连续执行两次不消耗额度的查询，只选择已经确认重置时间随查询时间移动的账号。随后会列出目标账号并要求确认，默认选中 **Cancel**，使用方向键和 Enter 完成选择。确认后，工具会为每个目标账号发送一次简短、只读且不保留会话的 Codex 请求，然后刷新缓存中的重置时间。失败的请求不会自动重试。

每次请求前，Codex Shift 会读取该账号的可用模型列表，按照内置的 OpenAI 官方费率排序选择成本最低的可用模型（优先 GPT-5.6 Luna），并使用该模型支持的最低推理强度。运行时不会联网查询价格页面。如果可用模型中没有可判断成本的模型，则使用该账号的默认模型；无法读取模型列表时，使用 Codex CLI 的默认模型。

额度消耗会通过以下方式尽量降低：

- 固定提示词只要求模型回复 `OK`。
- 请求在空的临时目录中运行，并要求模型不要读取文件或调用工具。
- 忽略用户配置和规则，避免项目指令及已配置的 MCP 服务增加上下文。
- 使用不保留历史记录的临时会话。
- 选择成本最低的已知可用模型，以及该模型支持的最低推理强度。

只有最终确认后发送的请求会消耗额度；账号检查和模型列表查询不会生成模型回复。由于 OpenAI 会根据模型、上下文、推理、工具及输入输出 token 计算用量，因此无法承诺固定数值。这个请求被设计为远小于普通 Codex 任务，产生的消耗可能小到不会反映在取整后的 `WEEK LEFT` 百分比中。用量计算方式可参阅 [OpenAI Codex 官方费率说明](https://learn.chatgpt.com/docs/pricing)。

请求使用隔离的临时 `CODEX_HOME`，不会切换当前账号，也不会创建持久化 Codex 会话。请在交互式终端中运行；输入被重定向或通过管道传递时会直接取消，不发送请求。

## 存储与安全

账号凭据只保存在本机。不同 profile 的凭据存放在：

```text
~/.codex-accounts/<profile>/auth.json
```

Windows 使用用户主目录下的对应路径。Codex Shift 不会主动打印认证 token；账号查询创建的临时目录会在每次查询结束后删除。

## License

MIT
