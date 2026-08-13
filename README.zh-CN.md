# Codex Shift

<p align="center">
  <a href="README.md">English</a> | <strong>简体中文</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/codex-shift"><img alt="npm 版本" src="https://img.shields.io/npm/v/codex-shift"></a>
  <a href="https://github.com/alexiiio/codex-shift/actions/workflows/ci.yml"><img alt="CI 状态" src="https://github.com/alexiiio/codex-shift/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Node.js 20 或更高版本" src="https://img.shields.io/node/v/codex-shift">
  <a href="https://github.com/alexiiio/codex-shift/blob/main/LICENSE"><img alt="MIT 许可证" src="https://img.shields.io/npm/l/codex-shift"></a>
</p>

OpenAI Codex CLI 的跨平台账号切换与周额度窗口初始化工具。

**切换账号，启动周额度窗口，不改变你的工作流。**

> Codex Shift 是非官方第三方工具，与 OpenAI 无隶属或官方背书关系。

核心功能包括：

- **切换账号：** 在本地保存多个 Codex 登录 profile，查看账号和周额度信息，并选择当前使用的账号。
- **启动周额度窗口：** 检测尚未开始计算周额度的已保存账号，仅在用户确认后发送一次刻意精简的 Codex 请求来启动窗口。

两个功能都会保留现有的 Codex Home，包括配置、MCP 服务、会话和历史记录。账号切换只替换当前使用的 `~/.codex/auth.json`；周额度初始化则在隔离的临时环境中运行。

**本地优先设计：** 凭据不进行云同步 · Codex 配置、会话和历史记录保持不变 · 任何消耗额度的请求都需要用户确认。详见[存储与安全](#存储与安全)。

## 安装

### 环境要求

- Node.js 20 或更高版本
- 已安装 [OpenAI Codex CLI](https://developers.openai.com/codex/cli)，并可通过 `codex` 命令调用

已通过 CI 在 macOS、Windows 和 Linux，以及 Node.js 20、22 环境中验证。

通过 npm 安装最新版本：

```bash
npm install --global codex-shift
```

安装完成后，确认命令可以正常调用：

```bash
codex-shift --help
```

## 保存第一个 profile

在已经安装并登录 Codex CLI 的前提下，安装 Codex Shift 并保存当前账号。`personal` 只是 profile 名称示例，请替换成你需要的名称。

```bash
codex-shift save personal
codex-shift current
```

登录另一个账号，并将它保存为 profile。`work` 同样只是可以自定义的名称示例：

```bash
codex-shift login work
```

查看账号及周额度信息，并通过交互列表切换 profile：

```bash
codex-shift list
```

![使用脱敏数据展示的 Codex Shift 账号列表](https://raw.githubusercontent.com/alexiiio/codex-shift/main/docs/images/list-demo.svg)

_图片仅为功能示意，使用脱敏数据；凭据和 token 不会显示在列表中。_

启动尚未开始计算的周额度窗口：

```bash
codex-shift init-week
```

Codex Shift 会检测符合条件的账号，展示本次使用的最小模型与推理方案，支持逐账号选择，并在为每个选中账号发送一次刻意精简的请求前进行最终确认。选择取消不会发送请求，也不会消耗额度。

## 命令

| 命令 | 说明 |
| --- | --- |
| `codex-shift login <name>` | 登录 Codex、保存账号并设为当前 profile |
| `codex-shift save <name>` | 保存 Codex 当前正在使用的账号 |
| `codex-shift use <name>` | 切换到已保存的 profile |
| `codex-shift list` | 刷新 profile，并通过交互列表选择要切换的账号 |
| `codex-shift init-week` | 逐账号选择，并通过一次最小请求启动尚未开始的周额度窗口 |
| `codex-shift init-week --dry-run` | 显示符合条件的账号、模型和推理强度，不消耗额度 |
| `codex-shift current` | 显示当前 profile |
| `codex-shift remove <name> [--yes]` | 删除一个非当前 profile；`--yes` 可跳过确认 |
| `codex-shift --help` | 显示命令帮助 |

Profile 名称可以包含英文字母、数字、点、下划线和连字符。

## 账号信息

`codex-shift list` 会通过有并发上限的并行查询刷新每个已保存 profile 的账号和周额度信息。每次查询都在临时 `CODEX_HOME` 中进行，因此刷新其他账号的信息不会替换当前使用的 `~/.codex/auth.json`。

账号列表可以显示邮箱、订阅类型、周额度剩余量、重置时间和数据来源。`LIVE` 表示本次实时刷新成功，`CACHED` 表示实时查询失败并正在显示缓存，`UNAVAILABLE` 表示实时和缓存数据都不可用。重置时间使用运行 Codex Shift 的本机时区。如果尚未使用的周额度窗口返回了一个随查询时间向后移动的重置时间，Codex Shift 会显示 `Not started`，而不是显示这个动态时间。

在交互式终端中，`>` 表示当前选择，`*` 表示当前正在使用的 profile。使用方向键选择 profile，按 Enter 进入下一步，然后在确认界面选择 `Confirm switch` 或 `Cancel`；默认选中 `Confirm switch`。按 `R` 重新刷新，按 `Q` 或 Esc 退出。输出被重定向或通过管道传递时，`list` 会打印非交互表格并退出。

如果所有实时刷新都失败，`list` 仍会显示缓存或不可用的数据行，但会返回退出状态 `1`，以便脚本识别本次没有获得实时数据。

### 启动尚未使用的周额度窗口

部分账号只有在发出第一条 Codex 请求后才会开始计算周额度窗口。运行：

```bash
codex-shift init-week
```

Codex Shift 会对每个 profile 连续执行两次不消耗额度的查询，只选择在本轮检查中明确确认重置时间随查询时间移动的账号；缓存状态不会被用作初始化依据。使用方向键和 Space 可以逐账号勾选，随后会展示并冻结本次使用的模型与推理强度。最终确认默认选中 **Cancel**。发送每个请求前，工具会在进程锁内再次检查；如果账号已不能确认处于未启动状态，则会跳过且不消耗额度。失败的请求不会自动重试。

运行 `codex-shift init-week --dry-run` 可以输出相同的账号资格与模型计划，不进入选择界面，也不会发送模型请求。

确认前，Codex Shift 会读取每个账号的可用模型列表，按照内置的 OpenAI 官方费率排序选择成本最低的可用模型（优先 GPT-5.6 Luna），并使用该模型支持的最低推理强度。界面显示的选择会被冻结，并原样传给实际请求。运行时不会联网查询价格页面。如果可用模型中没有可判断成本的模型，则显示并使用该账号的默认模型；无法读取模型列表时显示 `Codex default`，由 Codex CLI 决定模型。

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

Windows 使用用户主目录下的对应路径。Codex Shift 不会主动打印认证 token；账号查询和登录创建的临时目录会在结束后删除。

凭据变更使用原子文件替换、中断恢复标记和跨进程锁。Codex Shift 在自动把当前凭据同步回标记为当前的 profile 前，会验证两份凭据属于同一账号。如果用户在 Codex Shift 之外登录了其他账号，切换操作会停止，而不会覆盖已保存的 profile；此时可运行 `codex-shift save <name>` 显式保存当前登录。`codex-shift login` 也在隔离的临时 `CODEX_HOME` 中运行，因此登录失败或中断不会改动当前凭据文件。

删除 profile 会永久移除其保存在本机的凭据和 metadata。交互式终端会要求确认，并默认取消；脚本或重定向输入必须传入 `--yes`。当前 profile 不能被删除。

## License

MIT
