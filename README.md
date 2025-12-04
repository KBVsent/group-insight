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
| `#个人词云` | 生成自己今天的词云 | 所有人 |
| `#个人词云 三天` | 生成自己三天的词云 | 所有人 |
| `#个人词云 七天` | 生成自己七天的词云 | 所有人 |
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

在 `config/config.yaml` 中可自定义，完整配置项请参考 [`config/default_config.yaml`](config/default_config.yaml)。

### 词云自定义词典

插件支持自定义词典和过滤词，用于优化词云分词效果。首次运行后，需自行在 `config/` 目录下创建这两个文件，修改后重启生效。

<details>
<summary>查看词典格式说明</summary>

#### 自定义词典 (`config/userdict.txt`)

让分词器正确识别特定词汇（如游戏角色名、专有名词），避免被错误切分。

```text
# 格式：词语 词频(可选) 词性(可选)
# 词频越高，该词被分出的概率越大
千恋万花 10 nr
八重神子 10 nr
鸣潮
碧蓝档案
```

#### 过滤词 (`config/stopwords.txt`)

这些词不会出现在词云中，用于过滤无意义的词汇或者Bot指令。

```text
# 每行一个词，支持 # 开头的注释
的
了
是
# 可添加群内特定词汇
```

</details>

## 依赖说明

执行 `pnpm install` 自动安装所有依赖：

- **openai** - OpenAI SDK（兼容所有 OpenAI 格式 API）
- **jieba-wasm** - 中文分词
- **marked** - Markdown 解析
- **yaml** - 配置文件解析
- **jsonrepair** - JSON 修复

## 常见问题

<details>
<summary>AI 分析失败</summary>

1. 检查 API Key 是否正确配置
2. 检查 `baseURL` 是否与服务商匹配
3. 查看错误日志：`pnpm log`
4. 确认 API 额度充足

</details>

<details>
<summary>消息收集不工作</summary>

1. 确认 Redis 运行正常
2. 检查配置文件存在: `plugins/group-insight/config/config.yaml`
3. 重启 Yunzai

</details>

<details>
<summary>配置修改后未生效</summary>

1. 检查 YAML 语法是否正确(注意缩进)
2. 查看控制台日志是否有 "配置变更" 提示
3. 如果没有自动重载,手动重启 Yunzai

</details>

<details>
<summary>批次生成失败</summary>

当群消息量大时（>1000条），插件会自动分批次分析。如遇批次失败：

1. 再次请求报告时会自动尝试补全失败批次
2. 失败批次标记 `retried=true` 后不会重复尝试
3. 检查 AI API Key 和网络连接

</details>

## 技术架构

<details>
<summary>查看技术细节</summary>

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

</details>


## 致谢

- [TRSS-Yunzai](https://github.com/TimeRainStarSky/Yunzai) - Bot 框架
- [astrbot-qq-group-daily-analysis](https://github.com/SXP-Simon/astrbot-qq-group-daily-analysis) - 群聊报告部分灵感来源

## License

MIT License
