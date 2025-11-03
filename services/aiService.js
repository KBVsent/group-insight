/**
 * AI 服务抽象层
 * 支持多种 AI 提供商，方便切换
 */

import moment from 'moment'
import TextProcessor from '../utils/textProcessor.js'

export default class AIService {
  constructor(config) {
    this.config = config || {}
    this.provider = config.provider || 'claude'
    this.apiKey = config.apiKey
    this.model = config.model
    this.baseURL = config.baseURL
    this.timeout = config.timeout || 60000
    this.maxTokens = config.maxTokens || 2000
    this.maxMessages = config.maxMessages || 500
    this.textProcessor = new TextProcessor()
    this.client = null
    this.initialized = false
  }

  /**
   * 初始化 AI 客户端
   */
  async init() {
    // 避免重复初始化
    if (this.initialized) {
      return true
    }

    if (!this.apiKey) {
      logger.warn('[群聊洞见] AI API Key 未配置，请在 config/config/group-insight.yaml 中配置')
      this.initialized = false
      return false
    }

    try {
      switch (this.provider) {
        case 'claude':
          await this.initClaude()
          break
        case 'openai':
          await this.initOpenAI()
          break
        default:
          logger.error(`[群聊洞见] 不支持的 AI 提供商: ${this.provider}`)
          this.initialized = false
          return false
      }

      this.initialized = true
      logger.info(`[群聊洞见] AI 服务初始化成功，提供商: ${this.provider}`)
      return true
    } catch (err) {
      logger.error(`[群聊洞见] AI 服务初始化失败: ${err}`)
      this.initialized = false
      return false
    }
  }

  /**
   * 初始化 Claude 客户端
   */
  async initClaude() {
    try {
      const Anthropic = await import('@anthropic-ai/sdk')
      const AnthropicClass = Anthropic.default || Anthropic

      this.client = new AnthropicClass({
        apiKey: this.apiKey,
        baseURL: this.baseURL || undefined,
        timeout: this.timeout
      })

      this.model = this.model || 'claude-3-5-sonnet-20241022'
    } catch (err) {
      logger.error('[群聊洞见] @anthropic-ai/sdk 未安装')
      logger.warn('[群聊洞见] 请运行: cd plugins/group-insight && pnpm install')
      throw err
    }
  }

  /**
   * 初始化 OpenAI 客户端
   */
  async initOpenAI() {
    try {
      const OpenAI = await import('openai')
      const OpenAIClass = OpenAI.default || OpenAI

      this.client = new OpenAIClass({
        apiKey: this.apiKey,
        baseURL: this.baseURL || undefined,
        timeout: this.timeout
      })

      this.model = this.model || 'gpt-4o'
    } catch (err) {
      logger.error('[群聊洞见] openai 未安装')
      logger.warn('[群聊洞见] 请运行: cd plugins/group-insight && pnpm add openai')
      throw err
    }
  }

  /**
   * 总结群聊消息
   * @param {array} messages - 消息列表
   * @param {object} options - 选项
   * @param {string} options.groupName - 群名
   * @param {number} options.days - 天数
   * @param {string} options.previousSummary - 上次总结内容（用作上下文）
   */
  async summarize(messages, options = {}) {
    if (!this.client) {
      const initialized = await this.init()
      if (!initialized) {
        return { success: false, error: 'AI 服务未初始化' }
      }
    }

    const {
      groupName = '未知群聊',
      days = 1,
      previousSummary = null
    } = options

    try {
      // 格式化消息（使用可配置的消息数量限制）
      const formattedMessages = this.textProcessor.formatForAI(messages, this.maxMessages)

      if (formattedMessages.length === 0) {
        return { success: false, error: '没有可总结的消息' }
      }

      // 构建 Prompt（包含历史总结上下文）
      const prompt = this.buildPrompt(formattedMessages, groupName, days, previousSummary)

      logger.info(`[群聊洞见] 开始调用 AI 总结，消息数: ${formattedMessages.length}${previousSummary ? '（包含历史总结上下文）' : ''}`)

      // 调用 AI
      let summary
      switch (this.provider) {
        case 'claude':
          summary = await this.callClaude(prompt)
          break
        case 'openai':
          summary = await this.callOpenAI(prompt)
          break
        default:
          return { success: false, error: '不支持的 AI 提供商' }
      }

      logger.info('[群聊洞见] AI 总结完成')

      return {
        success: true,
        summary,
        messageCount: formattedMessages.length,
        provider: this.provider,
        model: this.model
      }
    } catch (err) {
      logger.error(`[群聊洞见] AI 总结失败: ${err}`)
      return { success: false, error: err.message }
    }
  }

  /**
   * 构建 Prompt
   * @param {array} messages - 格式化后的消息
   * @param {string} groupName - 群名
   * @param {number} days - 天数
   * @param {string} previousSummary - 上次总结内容（可选）
   */
  buildPrompt(messages, groupName, days, previousSummary = null) {
    const timeRange = days === 1 ? '今天' : days === 3 ? '最近三天' : '最近七天'

    // 将消息格式化为文本
    const messagesText = messages
      .map(msg => {
        const time = moment(msg.time * 1000).format('HH:mm')
        return `[${time}] ${msg.user}: ${msg.content}`
      })
      .join('\n')

    // 构建历史总结上下文部分
    let contextSection = ''
    if (previousSummary) {
      contextSection = `

之前的总结内容（作为上下文参考）：
${previousSummary}

---

请基于以上历史总结，结合下面的新消息，生成更新后的总结。注意整合新旧信息，保持连贯性。`
    }

    return `你是一个群聊分析助手。请分析以下群聊消息，并生成一份简洁的总结报告。${contextSection}

群聊信息：
- 群名：${groupName}
- 时间范围：${timeRange}
- 消息数量：${messages.length} 条

群聊消息：
${messagesText}

请按以下格式输出总结：

# 群聊总结

## 主要话题
[列出3-5个主要讨论的话题，每个话题用一句话概括]

## 活跃成员
[列出最活跃的3-5位成员及他们的主要讨论内容]

## 重要事件
[如果有重要事件、公告或决定，在这里列出]

## 群聊氛围
[用1-2句话描述群聊的整体氛围]

注意：
1. 总结要简洁明了，避免冗长
2. 忽略无意义的闲聊和灌水内容
3. 关注有价值的讨论和信息
4. 保持客观中立的语气${previousSummary ? '\n5. 如果之前总结中的话题在新消息中有延续，请更新相关内容' : ''}`
  }

  /**
   * 通用聊天接口 (供分析器使用)
   * @param {string} prompt - 提示词
   * @param {number} maxTokens - 最大 Token 数
   * @param {number} temperature - 温度参数
   * @param {number} timeout - 超时时间 (秒)
   * @returns {Promise<Object>} 返回 { content, usage }
   */
  async chat(prompt, maxTokens = 2000, temperature = 0.7, timeout = 100) {
    if (!this.client) {
      const initialized = await this.init()
      if (!initialized) {
        throw new Error('AI 服务未初始化')
      }
    }

    try {
      // 创建超时 Promise
      const timeoutMs = timeout * 1000
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`AI 请求超时 (${timeout}秒)`))
        }, timeoutMs)
      })

      // 创建请求 Promise
      const requestPromise = this._makeRequest(prompt, maxTokens, temperature)

      // 使用 Promise.race 实现超时控制
      const result = await Promise.race([requestPromise, timeoutPromise])

      return result
    } catch (err) {
      if (err.message.includes('超时')) {
        logger.error(`[AIService] AI 请求超时 (${timeout}秒): ${prompt.substring(0, 100)}...`)
      } else {
        logger.error(`[AIService] Chat 调用失败: ${err.message}`)
      }
      throw err
    }
  }

  /**
   * 执行实际的 AI 请求（内部方法）
   * @private
   */
  async _makeRequest(prompt, maxTokens, temperature) {
    let content = ''
    let usage = null

    switch (this.provider) {
      case 'claude': {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: maxTokens,
          temperature,
          messages: [{
            role: 'user',
            content: prompt
          }]
        })
        content = response.content[0].text
        usage = {
          prompt_tokens: response.usage?.input_tokens || 0,
          completion_tokens: response.usage?.output_tokens || 0,
          total_tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
        }
        break
      }
      case 'openai': {
        const response = await this.client.chat.completions.create({
          model: this.model,
          max_tokens: maxTokens,
          temperature,
          messages: [{
            role: 'user',
            content: prompt
          }]
        })
        content = response.choices[0].message.content
        usage = {
          prompt_tokens: response.usage?.prompt_tokens || 0,
          completion_tokens: response.usage?.completion_tokens || 0,
          total_tokens: response.usage?.total_tokens || 0
        }
        break
      }
      default:
        throw new Error(`不支持的 AI 提供商: ${this.provider}`)
    }

    return { content, usage }
  }

  /**
   * 调用 Claude API
   */
  async callClaude(prompt) {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })

    return response.content[0].text
  }

  /**
   * 调用 OpenAI API
   */
  async callOpenAI(prompt) {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })

    return response.choices[0].message.content
  }
}
