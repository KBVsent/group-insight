# 群聊洞见插件 (Group Insight)

一个功能强大的 Yunzai 群聊分析插件，提供 AI 驱动的深度洞察、词云生成和消息追踪功能。

## 核心功能

- 🤖 **AI 智能分析** - 话题提取、金句识别、用户称号、MBTI 性格分析
- 📊 **数据可视化** - 活跃度热力图、统计报告、精美卡片展示
- ☁️ **词云生成** - 智能中文分词、精美渐变设计
- 📌 **@消息追踪** - 自动记录艾特消息、支持上下文查看

## 快速开始

### 1. 安装依赖

```bash
cd plugins/group-insight
pnpm install
```

### 2. 配置 API Key

创建配置文件 `../../config/config/group-insight.yaml`:

```yaml
groupManager:
  ai:
    # 必填：AI API Key
    apiKey: 'your-api-key-here'

    # 可选：提供商 (claude 或 openai)
    provider: 'claude'

    # 可选：模型名称
    model: 'claude-haiku-4-5'
```

### 3. 重启 Yunzai

```bash
pnpm restart
```

## 命令列表

| 命令 | 说明 | 权限 |
|------|------|------|
| `#群聊报告` | 生成今天的 AI 分析报告 | 所有人 |
| `#群聊报告 昨天` | 生成昨天的报告 | 所有人 |
| `#群聊报告 2024-11-01` | 生成指定日期报告 | 所有人 |
| `#强制生成报告` | 强制生成报告(忽略冷却) | 主人 |
| `#词云` / `#群聊词云` | 生成今天的词云 | 所有人 |
| `#词云 三天` | 生成三天词云 | 所有人 |
| `#词云 七天` | 生成七天词云 | 所有人 |
| `谁艾特我` / `谁@我` | 查看谁艾特了你 | 所有人 |
| `#清除艾特数据` | 清除自己的艾特记录 | 所有人 |
| `#清除全部艾特数据` | 清除所有艾特记录 | 主人 |

## AI 分析报告内容

生成的报告包含以下模块:

- **基础统计** - 消息数、参与人数、字符统计、表情统计
- **活跃度分析** - 24小时活跃度热力图、峰值时段
- **话题提取** - 3-5个主要讨论话题及参与者
- **金句识别** - 3-5条精选有趣/震撼语句
- **用户称号** - 基于行为模式分配创意称号 + MBTI
- **Token 统计** - AI 使用情况追踪

## 核心配置

在 `config/config/group-insight.yaml` 中可自定义:

```yaml
groupManager:
  # 消息保留天数
  retentionDays: 7

  # 艾特记录保留时间(小时)
  atRetentionHours: 24

  # AI 配置
  ai:
    apiKey: ''              # API Key (必填)
    provider: 'claude'      # 提供商: claude / openai
    model: 'claude-haiku-4-5'  # 模型名称
    baseURL: ''             # 自定义端点(可选)
    maxTokens: 20000        # 最大 Token

  # AI 分析开关
  analysis:
    topic:
      enabled: true         # 话题分析
      max_topics: 5
    goldenQuote:
      enabled: true         # 金句提取
      max_golden_quotes: 5
    userTitle:
      enabled: true         # 用户称号
      max_user_titles: 8
    activity:
      enabled: true         # 活跃度图表
    min_messages_threshold: 20  # 最少消息数(低于此数跳过分析)

  # 定时任务配置
  schedule:
    enabled: false          # 是否启用
    whitelist: []           # 白名单群列表(为空则不执行)
    minMessages: 99         # 最少消息数
    cooldownMinutes: 60     # 冷却时长(分钟)
    # 执行时间: 每天 23:59 (在 apps/report.js 中配置)

  # 词云配置
  wordCloud:
    maxWords: 100           # 最多显示词数
    width: 1200             # 画布宽度
    height: 800             # 画布高度
```

## 依赖说明

### 必需依赖
- `nodejieba` - 中文分词
- `@anthropic-ai/sdk` - Claude AI SDK (若使用 Claude)
- `marked` - Markdown 解析
- `yaml` - 配置文件解析

### 可选依赖
- `openai` - 使用 OpenAI 时需要安装

## 使用 OpenAI

如需使用 OpenAI:

```bash
# 安装 OpenAI SDK
cd plugins/group-insight
pnpm add openai
```

配置文件修改为:

```yaml
groupManager:
  ai:
    provider: 'openai'
    apiKey: 'sk-xxx...'
    model: 'gpt-4o'
```

## 使用国内镜像/代理

配置自定义 API 端点:

```yaml
groupManager:
  ai:
    provider: 'claude'
    apiKey: 'your-key'
    baseURL: 'https://your-proxy.com/v1'
```

## 常见问题

### AI 分析失败

1. 检查 API Key 是否正确
2. 检查网络连接(可能需要代理)
3. 查看错误日志: `pnpm log`
4. 确认 API 额度充足

### 消息收集不工作

1. 确认 Redis 运行正常
2. 检查配置 `messageCollection.enabled: true`
3. 重启 Yunzai

## 技术架构

### 目录结构

```
plugins/group-insight/
├── apps/              # 命令插件(热重载)
├── services/          # 业务逻辑服务
├── components/        # 核心组件(配置、服务管理)
├── utils/             # 工具函数
├── resources/         # 模板与资源
└── config/            # 配置文件
```

### 核心特性

- **Singleton 服务管理** - 全局单例,按需初始化
- **配置热重载** - 修改配置无需重启
- **并行 AI 分析** - 3个分析器并行执行
- **智能重试机制** - AI 请求失败自动重试
- **优雅降级** - 部分失败不影响整体报告
- **Redis 存储** - 消息自动过期、@记录精确过期

## 版本信息

- **版本**: v2.0.0
- **作者**: vsentkb
- **许可**: MIT

## 致谢

- [TRSS-Yunzai](https://github.com/TimeRainStarSky/Yunzai) - Bot 框架

## License

MIT License
