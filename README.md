# 群聊洞见插件 (Group Insight)

![Banner](https://upload.cc/i1/2025/11/21/q4KxA8.jpeg)

一个功能强大的 Yunzai 群聊分析插件，提供 AI 驱动的深度洞察、词云生成和消息追踪功能。

## 核心功能

- **AI 智能分析** - 话题提取、金句识别、用户称号、MBTI 性格分析
- **数据可视化** - 活跃度热力图、统计报告、精美卡片展示
- **词云生成** - 智能中文分词、精美渐变设计
- **@消息追踪** - 自动记录艾特消息、支持上下文查看

## 功能展示

### 群聊分析报告

通过 `#群聊报告` 命令生成的 AI 智能分析报告，包含基础统计、活跃度分布、热门话题、群友称号和群圣经等模块。

![群聊报告展示](https://upload.cc/i1/2025/11/19/x9OQGs.png)

### 群聊词云

通过 `#词云` 命令生成的精美词云图，直观展示群聊热词分布。

![词云展示](https://upload.cc/i1/2025/11/19/uRway4.png)

## 快速开始

### 1. 安装依赖

```bash
cd plugins/group-insight
pnpm install
```

### 2. 配置 AI 服务

首次启动时，插件会自动在 `config/` 目录下创建 `config.yaml` 配置文件。

编辑 `plugins/group-insight/config/config.yaml`：

```yaml
groupManager:
  ai:
    # 必填：AI API Key
    apiKey: 'your-api-key-here'

    # 必填：模型名称
    model: 'gpt-4.1'

    # 必填：API 端点
    baseURL: 'https://api.openai.com/v1'
```

**支持所有兼容 OpenAI API 格式的服务商**（OpenAI、Claude、DeepSeek、通义千问等）

**注意**：配置文件支持热重载，修改后无需重启机器人。

### 3. 重启 Yunzai

```bash
pnpm restart
```

## 命令列表

| 命令 | 说明 | 权限 |
|------|------|------|
| `#群聊报告` | 生成今天的 AI 分析报告 | 所有人 |
| `#群聊报告 昨天` | 生成昨天的报告 | 所有人 |
| `#群聊报告 前天` | 生成前天的报告 | 所有人 |
| `#群聊报告 2024-11-01` | 生成指定日期报告（7天内） | 所有人 |
| `#强制生成报告` | 强制生成今天报告(忽略冷却) | 主人 |
| `#强制生成报告 昨天` | 强制生成昨天报告 | 主人 |
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

### 历史报告支持

- **今天报告**：可多次生成，1小时冷却期内返回缓存
- **历史报告**（昨天/前天/指定日期）：首次生成后即为定型报告，后续请求直接返回缓存
- **自动批次补全**：对于大消息量群聊，自动补全缺失或失败的批次分析
- **并发保护**：同一群同一日期的报告不会被重复生成

## 核心配置

在 `plugins/group-insight/config/config.yaml` 中可自定义:

```yaml
groupManager:
  # 消息保留天数
  retentionDays: 7

  # 艾特记录保留时间(小时)
  atRetentionHours: 24

  # AI 配置
  ai:
    apiKey: ''              # API Key (必填)
    model: 'gpt-4.1'  # 模型名称 (必填)
    baseURL: ''             # API 端点 (必填)
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

执行 `pnpm install` 自动安装所有依赖：

- **openai** - OpenAI SDK（兼容所有 OpenAI 格式 API）
- **jieba-wasm** - 中文分词
- **marked** - Markdown 解析
- **yaml** - 配置文件解析
- **jsonrepair** - JSON 修复

## 常见问题

### AI 分析失败

1. 检查 API Key 是否正确配置
2. 检查 `baseURL` 是否与服务商匹配
3. 查看错误日志：`pnpm log`
4. 确认 API 额度充足

### 消息收集不工作

1. 确认 Redis 运行正常
2. 检查配置文件存在: `plugins/group-insight/config/config.yaml`
3. 重启 Yunzai

### 配置修改后未生效

1. 检查 YAML 语法是否正确(注意缩进)
2. 查看控制台日志是否有 "配置变更" 提示
3. 如果没有自动重载,手动重启 Yunzai

### 批次生成失败

当群消息量大时（>1000条），插件会自动分批次分析。如遇批次失败：

1. 再次请求报告时会自动尝试补全失败批次
2. 失败批次标记 `retried=true` 后不会重复尝试
3. 检查 AI API Key 和网络连接

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

- **Singleton 服务管理** - 全局单例,按需初始化,统一配置热重载
- **配置热重载** - 修改配置无需重启,自动重新初始化所有服务
- **首次启动自动配置** - 自动复制默认配置,无需手动创建
- **并行 AI 分析** - 3个分析器并行执行,大幅提升速度
- **智能重试机制** - AI 请求失败自动重试,网络波动不影响使用
- **优雅降级** - 部分分析失败不影响整体报告生成
- **并发控制** - Redis 分布式锁防止同一报告重复生成
- **历史报告支持** - 支持查询7天内历史日期报告,自动批次补全
- **高性能优化**:
  - 统计计算单次遍历 (4x 性能提升)
  - Redis 批量操作 (50x 性能提升)
  - 增量 AI 分析 (80% Token 节省)
- **Redis 存储** - 消息自动过期、@记录精确过期、原子批量操作
- **资源管理** - 进程退出钩子,自动清理事件监听器和定时任务


## 致谢

- [TRSS-Yunzai](https://github.com/TimeRainStarSky/Yunzai) - Bot 框架
- [astrbot-qq-group-daily-analysis](https://github.com/SXP-Simon/astrbot-qq-group-daily-analysis) - 群聊报告部分灵感来源

## License

MIT License
