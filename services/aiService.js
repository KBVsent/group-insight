/**
 * AI 服务抽象层
 * 支持多种 AI 提供商，方便切换
 */

export default class AIService {
  constructor(config) {
    this.config = config || {}
    this.provider = config.provider || 'claude'
    this.apiKey = config.apiKey
    this.model = config.model
    this.baseURL = config.baseURL
    this.timeout = config.timeout || 60000
    this.maxTokens = config.maxTokens || 2000
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
      logger.debug(`[群聊洞见] AI 服务初始化成功，提供商: ${this.provider}`)
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
}
