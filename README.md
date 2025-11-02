# 群聊信息管理插件 (增强版)

一个功能强大的 Yunzai 群聊管理插件，提供以下功能：

- 📌 **谁艾特我**：查看谁在群里艾特了你，支持查看历史艾特记录
- ☁️ **词云生成**：分析群聊消息生成精美的词云图，支持当天/三天/七天
- 🤖 **AI 增强分析**：深度分析群聊内容，提供话题提取、金句识别、用户称号等多维度洞察

## 功能特性

### 1. 谁艾特我
- 📝 自动记录所有艾特消息
- 🖼️ 支持图片、表情、文本的完整记录
- 📦 合并转发消息展示，方便查看
- ⏰ 默认保留 24 小时

### 2. 词云生成
- 📊 基于 Puppeteer + wordcloud2.js 生成
- 🔤 智能中文分词（nodejieba）
- 🚫 过滤停用词、表情、命令等无意义内容
- 🎨 精美的渐变背景和配色
- 📅 支持当天/三天/七天时间范围

### 3. AI 增强分析 (新功能)

#### 📊 基础统计
- 消息总数、参与人数、字符统计
- 表情使用统计（face/mface/bface/sface）
- 用户活跃度分析（消息数、回复率、夜猫子率）
- 最活跃时段识别

#### 📈 活跃度可视化
- **24小时活跃度热力图**：直观展示群聊活跃时段
- 峰值时段高亮显示
- 活跃度等级分级（高/中/低/无）
- 精美的渐变色柱状图

#### 💬 话题分析
- AI 智能提取 3-5 个主要讨论话题
- 识别每个话题的主要参与者
- 提供详细的话题描述和讨论结论
- 讲清前因后果，不只是列出结论

#### 🏆 用户称号 & MBTI
- 基于行为模式分配创意称号（龙王、夜猫子、表情包大师等）
- MBTI 性格类型推测
- 综合考虑：消息数、平均长度、表情率、回复率、夜间活跃度
- 最多分配 5-8 位用户称号

#### 💎 群圣经 (金句提取)
- AI 识别有趣、震撼、富有哲理的语句
- 3-5 条精选金句
- 包含发言人和选择理由
- 过滤命令、纯符号等无效内容

#### 🎨 可视化报告
- 卡片式设计，清晰分区
- 移动端友好布局
- 渐变色主题
- Token 使用统计

## 安装步骤

### 1. 进入插件目录
```bash
cd plugins/group-insight
```

### 2. 安装依赖
```bash
# 使用 pnpm（推荐）
pnpm install

# 或使用 npm
npm install
```

### 3. 配置 AI API Key

复制配置示例文件：
```bash
cp config/config.example.yaml ../../config/config/group-insight.yaml
```

编辑配置文件 `config/config/group-insight.yaml`：
```yaml
groupManager:
  ai:
    # 在此填入你的 AI API Key
    apiKey: 'your-api-key-here'

    # 可选：自定义 API 端点
    # baseURL: 'https://your-api-endpoint.com'
```

### 4. 重启 Yunzai

```bash
# 如果使用 PM2
pnpm restart

# 如果使用守护进程
node . stop
node . daemon

# 或者直接重启
node .
```

## 使用方法

### 命令列表

| 命令 | 说明 | 示例 |
|------|------|------|
| `谁艾特我` / `谁@我` | 查看谁艾特了你 | 谁艾特我 |
| `#词云` / `#群聊词云` | 生成当天词云 | #词云 |
| `#词云 三天` | 生成三天内词云 | #词云 三天 |
| `#词云 七天` | 生成七天内词云 | #词云 七天 |
| `#群聊总结` / `#总结` | 查询已有的 AI 总结 | #总结 |
| `#总结 三天` | 查询三天内总结 | #总结 三天 |
| `#总结 七天` | 查询七天内总结 | #总结 七天 |
| `#强制总结` | [主人] 生成增强分析报告 | #强制总结 |
| `#清除艾特数据` | 清除自己的艾特记录 | #清除艾特数据 |
| `#清除全部艾特数据` | [主人] 清除所有艾特记录 | #清除全部艾特数据 |

**注意**：
- `#总结` 命令查询已保存的总结（由定时任务生成）
- `#强制总结` 命令立即执行增强分析（包含话题、金句、称号等）

### 使用示例

1. **查看谁艾特了我**
   ```
   用户: 谁艾特我
   机器人: [返回合并转发消息，包含所有艾特记录]
   ```

2. **生成词云**
   ```
   用户: #词云 三天
   机器人: 正在生成三天的词云，请稍候...
   机器人: [返回词云图片]
   ```

3. **AI 总结**
   ```
   用户: #总结 当天
   机器人: 正在使用 AI 分析当天的群聊内容，请稍候...
   机器人: [返回精美的总结报告图片]
   ```

## 配置说明

### 完整配置示例

在 `config/config/group-insight.yaml` 中可以自定义以下配置：

```yaml
groupManager:
  # 消息保留天数
  retentionDays: 7

  # 艾特记录保留时间（小时）
  atRetentionHours: 24

  # AI 配置
  ai:
    # AI 提供商: claude / openai
    provider: 'claude'

    # API Key
    apiKey: 'your-api-key-here'

    # 模型名称
    model: 'claude-haiku-4-5'

    # 自定义 API 端点（可选）
    baseURL: ''

    # 超时时间（毫秒）
    timeout: 60000

    # 最大 Token 数
    maxTokens: 2000

    # LLM 请求配置
    llm_timeout: 100        # 请求超时（秒）
    llm_retries: 2          # 重试次数
    llm_backoff: 2          # 重试退避时间（秒）

  # 高级 AI 分析配置
  analysis:
    # 话题分析
    topic:
      enabled: true         # 是否启用
      max_topics: 5         # 最多提取话题数

    # 金句提取
    goldenQuote:
      enabled: true         # 是否启用
      max_golden_quotes: 5  # 最多提取金句数
      min_quote_length: 5   # 金句最短长度
      max_quote_length: 100 # 金句最长长度

    # 用户称号
    userTitle:
      enabled: true         # 是否启用
      max_user_titles: 8    # 最多分配称号数
      min_messages_for_title: 5  # 获得称号的最少消息数

    # 活跃度可视化
    activity:
      enabled: true         # 是否启用活跃度图表

    # 最少消息数阈值（少于此数不执行 AI 分析）
    min_messages_threshold: 20

  # 统计配置
  statistics:
    night_start_hour: 0     # 夜间时段起始小时
    night_end_hour: 6       # 夜间时段结束小时

  # 词云配置
  wordCloud:
    maxWords: 100           # 最多显示词数
    minLength: 2            # 最短词长度
    minFrequency: 2         # 最小词频
    width: 1200             # 画布宽度
    height: 800             # 画布高度
    backgroundColor: '#ffffff'  # 背景颜色

  # 消息收集配置
  messageCollection:
    enabled: true           # 是否启用消息收集
    collectImages: false    # 是否收集图片
    collectFaces: false     # 是否收集表情
    maxMessageLength: 500   # 最大消息长度
```

### 切换 AI 提供商

#### 使用 Claude（默认）

```yaml
groupManager:
  ai:
    provider: 'claude'
    apiKey: 'sk-ant-xxx...'
    model: 'claude-3-5-sonnet-20241022'
```

#### 使用 OpenAI

先安装 OpenAI SDK：
```bash
cd plugins/group-insight
pnpm add openai
```

然后修改配置：
```yaml
groupManager:
  ai:
    provider: 'openai'
    apiKey: 'sk-xxx...'
    model: 'gpt-4o'
```

#### 使用国内镜像

如果使用国内 API 中转服务，可以配置 baseURL：
```yaml
groupManager:
  ai:
    provider: 'claude'
    apiKey: 'your-key'
    baseURL: 'https://your-proxy-service.com/v1'
```

## 依赖说明

### 必需依赖
- **nodejieba** (^2.6.0) - 中文分词
- **@anthropic-ai/sdk** (^0.32.1) - Claude AI SDK
- **marked** (^12.0.0) - Markdown 解析
- **yaml** (^2.4.0) - YAML 配置解析

### 可选依赖
- **openai** - 如果使用 OpenAI 作为 AI 提供商

## 常见问题

### 1. 依赖安装失败

如果 `pnpm install` 失败，尝试：

```bash
# 清除缓存
pnpm store prune

# 使用 npm 安装
npm install
```

### 2. nodejieba 安装失败

nodejieba 是 C++ 扩展，可能需要编译环境：

**Windows:**
- 安装 Visual Studio Build Tools
- 或使用 windows-build-tools: `npm install -g windows-build-tools`

**macOS:**
```bash
xcode-select --install
```

**Linux:**
```bash
sudo apt-get install build-essential
```

如果仍然无法安装，插件会自动降级使用简单分词。

### 3. 词云不显示或显示异常

1. 检查消息是否足够（至少需要一定量的中文消息）
2. 检查 Puppeteer 是否正常工作
3. 查看日志：`pnpm log`

### 4. AI 总结失败

1. 检查 API Key 是否正确配置
2. 检查网络连接（可能需要代理）
3. 检查 API 额度是否充足
4. 查看详细错误日志

### 5. 消息收集不工作

1. 确认 Redis 正常运行
2. 检查配置中 `messageCollection.enabled` 是否为 `true`
3. 重启 Yunzai

## 数据存储

### Redis 键结构

```
Yz:groupManager:msg:{群号}:{日期}       # 消息历史
Yz:groupManager:at:{群号}_{用户ID}      # 艾特记录
```

### 清理数据

如需手动清理数据，可在 Redis 中执行：

```bash
# 清理所有群聊管理数据
redis-cli KEYS "Yz:groupManager:*" | xargs redis-cli DEL

# 只清理某个群的数据
redis-cli KEYS "Yz:groupManager:*:群号*" | xargs redis-cli DEL
```

## 更新日志

### v2.0.0 (2025-11-02) - 增强分析版

- ✨ **全新增强分析功能**
  - ✅ 话题分析：AI 智能提取主要讨论话题
  - ✅ 金句提取：识别群聊中的有趣、震撼语句
  - ✅ 用户称号：基于行为模式分配创意称号和 MBTI
  - ✅ 活跃度可视化：24小时活跃度热力图

- 📊 **增强数据收集**
  - ✅ 支持多种表情类型（face/mface/bface/sface）
  - ✅ 记录回复消息、消息长度、小时分布
  - ✅ 用户行为统计（表情率、夜猫子率、回复率）

- 🎨 **全新可视化报告**
  - ✅ 卡片式设计，清晰分区
  - ✅ 移动端友好布局
  - ✅ 渐变色主题
  - ✅ 活跃度柱状图

- ⚡ **性能优化**
  - ✅ 并行执行多个 AI 分析
  - ✅ 配置化功能开关
  - ✅ 优雅降级机制
  - ✅ 智能阈值控制

### v1.0.0 (2025-11-01)

- ✨ 初始版本
- ✅ 实现谁艾特我功能
- ✅ 实现词云生成功能
- ✅ 实现 AI 总结功能
- ✅ 支持多种 AI 提供商
- ✅ 精美的可视化展示

## 开发者

- **作者**: vsentkb
- **版本**: 1.0.0
- **许可**: MIT

## 参与贡献

欢迎提交 Issue 和 Pull Request！

## 致谢

- [TRSS-Yunzai](https://github.com/TimeRainStarSky/Yunzai) - Bot 框架
- [nodejieba](https://github.com/yanyiwu/nodejieba) - 中文分词
- [wordcloud2.js](https://github.com/timdream/wordcloud2.js) - 词云生成
- [Anthropic Claude](https://www.anthropic.com/) - AI 服务

## License

MIT License
