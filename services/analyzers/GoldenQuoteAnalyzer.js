/**
 * 金句提取器
 * 从群聊中识别有趣、震撼或富有哲理的语句
 */

import BaseAnalyzer from './BaseAnalyzer.js'

export default class GoldenQuoteAnalyzer extends BaseAnalyzer {
  constructor(aiService, config = {}) {
    super(aiService, config)
    this.maxQuotes = config.max_golden_quotes || 5
    this.minLength = config.min_quote_length || 5
    this.maxLength = config.max_quote_length || 100
  }

  /**
   * 执行金句提取
   * @param {Array} messages - 消息列表
   * @param {Object} stats - 统计信息 (可选)
   * @returns {Promise<Object>} { goldenQuotes: Array, usage: Object }
   */
  async analyze(messages, stats = null) {
    if (!messages || messages.length === 0) {
      logger.warn('[GoldenQuoteAnalyzer] 消息列表为空')
      return { goldenQuotes: [], usage: null }
    }

    // 过滤不适合作为金句的消息
    const filteredMessages = messages.filter(msg => {
      const text = msg.message.trim()
      const length = text.length

      // 长度过滤
      if (length < this.minLength || length > this.maxLength) {
        return false
      }

      // 排除命令消息
      if (text.startsWith('#') || text.startsWith('/') || text.startsWith('.')) {
        return false
      }

      // 排除纯数字、纯链接
      if (/^[\d\s]+$/.test(text) || /^https?:\/\//.test(text)) {
        return false
      }

      // 排除单纯的表情或符号
      if (/^[?!。,.、\s]+$/.test(text)) {
        return false
      }

      return true
    })

    if (filteredMessages.length === 0) {
      logger.warn('[GoldenQuoteAnalyzer] 过滤后无可用消息')
      return { goldenQuotes: [], usage: null }
    }

    logger.info(`[GoldenQuoteAnalyzer] 过滤后剩余 ${filteredMessages.length} 条消息`)

    // 格式化消息
    const formattedMessages = this.formatMessages(filteredMessages, {
      includeTime: false,
      includeNickname: true,
      maxLength: 10000
    })

    // 构建提示词
    const prompt = this.buildPrompt(formattedMessages)

    // 调用 AI
    const result = await this.callAI(prompt, 1500, 0.8)

    if (!result || !result.content) {
      logger.error('[GoldenQuoteAnalyzer] AI 调用失败')
      return { goldenQuotes: [], usage: null }
    }

    // 解析 JSON 响应
    const quotes = this.parseJSON(result.content)

    if (!Array.isArray(quotes)) {
      logger.error('[GoldenQuoteAnalyzer] 返回格式错误,期望数组')
      return { goldenQuotes: [], usage: result.usage || null }
    }

    // 创建昵称到 user_id 的映射表
    const nicknameToUserId = new Map()
    if (stats && stats.users) {
      for (const user of stats.users) {
        nicknameToUserId.set(user.nickname, user.user_id)
      }
    }

    // 验证和清理数据，同时添加 user_id
    const validQuotes = quotes
      .filter(quote => quote && quote.quote && quote.sender && quote.reason)
      .map(quote => ({
        quote: quote.quote.trim(),
        sender: {
          nickname: quote.sender.trim(),
          user_id: nicknameToUserId.get(quote.sender.trim()) || null
        },
        reason: quote.reason.trim()
      }))
      .slice(0, this.maxQuotes)

    logger.info(`[GoldenQuoteAnalyzer] 提取到 ${validQuotes.length} 条金句`)

    return { goldenQuotes: validQuotes, usage: result.usage || null }
  }

  /**
   * 构建 AI 提示词
   * @param {string} formattedMessages - 格式化后的消息
   */
  buildPrompt(formattedMessages) {
    return `你是一个群聊金句识别专家,负责从群聊记录中挑选出最有价值的语句。

请从以下群聊记录中选出最多 ${this.maxQuotes} 条"群圣经"(金句),这些语句应该符合以下标准:
1. **有趣幽默**: 让人会心一笑的段子、梗、神回复
2. **富有哲理**: 发人深省、有深度的思考和观点
3. **震撼力强**: 出人意料、一针见血的评论
4. **情感共鸣**: 能引起大家共鸣的感慨或吐槽
5. **高度凝练**: 用简洁的语言表达深刻的含义

请注意:
- 优先选择完整、独立、有上下文的语句
- 避免选择需要太多背景才能理解的内容
- 排除无意义的闲聊、单纯的表情、命令等
- 每条金句要说明为什么选择它 (理由简洁,20字内)
- 如果实在没有符合标准的语句,可以返回空数组 []

群聊记录格式: 昵称: 消息内容

群聊记录:
${formattedMessages}

---

**重要：你必须只返回一个 JSON 数组，不要包含任何说明文字、代码块标记或其他内容。直接输出 JSON，从 [ 开始，以 ] 结束。**

返回格式（直接输出，不要用 \`\`\`json 包裹）:
[
  {
    "quote": "金句内容",
    "sender": "发言人昵称",
    "reason": "选择理由 (简短说明为什么这句话有价值)"
  },
  {
    "quote": "另一条金句",
    "sender": "另一个发言人",
    "reason": "选择理由..."
  }
]`
  }
}
