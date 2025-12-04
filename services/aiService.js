/**
 * AI 服务层
 * 使用 OpenAI SDK，兼容所有提供 OpenAI 格式 API 的服务商
 */

import { logger } from '#lib'

export default class AIService {
  constructor(config) {
    this.config = config || {}
    this.apiKey = config.apiKey
    this.model = config.model || 'gpt-4.1'
    this.baseURL = config.baseURL || 'https://api.openai.com/v1'
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
      logger.warn('AI API Key 未配置，请在 config/config/group-insight.yaml 中配置')
      this.initialized = false
      return false
    }

    try {
      const OpenAI = await import('openai')
      const OpenAIClass = OpenAI.default || OpenAI

      this.client = new OpenAIClass({
        apiKey: this.apiKey,
        baseURL: this.baseURL || undefined,
        timeout: this.timeout
      })

      this.initialized = true
      logger.debug(`AI 服务初始化成功，模型: ${this.model}`)
      return true
    } catch (err) {
      logger.error('openai SDK 未安装')
      logger.warn('请运行: cd plugins/group-insight && pnpm install')
      this.initialized = false
      return false
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
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: maxTokens,
      temperature,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })

    const content = response.choices[0].message.content
    const usage = {
      prompt_tokens: response.usage?.prompt_tokens || 0,
      completion_tokens: response.usage?.completion_tokens || 0,
      total_tokens: response.usage?.total_tokens || 0
    }

    return { content, usage }
  }
}
