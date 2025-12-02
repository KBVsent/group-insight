import { jsonrepair } from 'jsonrepair'

/**
 * AI 分析器基类
 * 提供通用的 AI 调用和错误处理逻辑
 */

export default class BaseAnalyzer {
  constructor(aiService, config = {}) {
    this.aiService = aiService
    this.config = config
    this.timeout = config.llm_timeout || 100
    this.retries = config.llm_retries || 2
    this.backoff = config.llm_backoff || 2
  }

  /**
   * 调用 AI 进行分析 (带重试)
   * @param {string} prompt - 提示词
   * @param {number} maxTokens - 最大 token 数
   * @param {number} temperature - 温度参数
   * @returns {Promise<Object>} AI 响应结果
   */
  async callAI(prompt, maxTokens = 2000, temperature = 0.7) {
    let lastError = null

    for (let attempt = 1; attempt <= this.retries + 1; attempt++) {
      try {
        logger.debug(`[${this.constructor.name}] AI 调用 - 尝试 ${attempt}/${this.retries + 1}`)

        const result = await this.aiService.chat(prompt, maxTokens, temperature, this.timeout)

        if (result && result.content) {
          logger.info(`[${this.constructor.name}] AI 调用成功 - Tokens: ${result.usage?.total_tokens || 'N/A'}`)
          return result
        } else {
          throw new Error('AI 返回内容为空')
        }
      } catch (err) {
        lastError = err
        logger.warn(`[${this.constructor.name}] AI 调用失败 (尝试 ${attempt}): ${err.message}`)

        // 如果不是最后一次尝试,等待后重试
        if (attempt <= this.retries) {
          const waitTime = this.backoff * attempt * 1000
          logger.info(`[${this.constructor.name}] ${waitTime / 1000}秒后重试...`)
          await this.sleep(waitTime)
        }
      }
    }

    // 所有重试都失败
    logger.error(`[${this.constructor.name}] AI 调用失败,已达最大重试次数: ${lastError?.message}`)
    return null
  }

  /**
   * 从 AI 响应中解析 JSON
   * @param {string} content - AI 返回的文本
   * @returns {Object|Array|null} 解析后的 JSON 或 null
   */
  parseJSON(content) {
    if (!content) return null

    try {
      // 尝试直接解析
      return JSON.parse(content)
    } catch (err) {
      // 使用回退策略提取 JSON（不输出日志，避免干扰）
    }

    // 尝试提取 JSON 内容
    let extractedJson = null

    try {
      // 尝试提取 JSON 代码块
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                       content.match(/```\s*([\s\S]*?)\s*```/)

      if (jsonMatch) {
        extractedJson = jsonMatch[1]
      } else {
        // 尝试提取数组或对象
        const arrayMatch = content.match(/\[[\s\S]*\]/)
        if (arrayMatch) {
          extractedJson = arrayMatch[0]
        } else {
          const objectMatch = content.match(/\{[\s\S]*\}/)
          if (objectMatch) {
            extractedJson = objectMatch[0]
          }
        }
      }

      // 如果提取到内容，先尝试直接解析
      if (extractedJson) {
        try {
          return JSON.parse(extractedJson)
        } catch (parseErr) {
          // 直接解析失败，尝试使用 jsonrepair 修复
          logger.info(`[${this.constructor.name}] 尝试使用 jsonrepair 修复 JSON...`)
          try {
            const repaired = jsonrepair(extractedJson)
            const parsed = JSON.parse(repaired)
            logger.mark(`[${this.constructor.name}] jsonrepair 修复成功！`)
            return parsed
          } catch (repairErr) {
            logger.warn(`[${this.constructor.name}] jsonrepair 修复失败: ${repairErr.message}`)
            throw repairErr
          }
        }
      }
    } catch (err) {
      logger.warn(`[${this.constructor.name}] JSON 解析失败: ${err.message}`)
    }

    // 最后尝试直接对原始内容使用 jsonrepair（可能 AI 直接返回了不规范的 JSON）
    try {
      logger.info(`[${this.constructor.name}] 尝试对原始内容使用 jsonrepair...`)
      const repaired = jsonrepair(content)
      const parsed = JSON.parse(repaired)
      logger.mark(`[${this.constructor.name}] jsonrepair 修复原始内容成功！`)
      return parsed
    } catch (err) {
      logger.error(`[${this.constructor.name}] 无法解析 JSON 响应`)
      logger.debug(`[${this.constructor.name}] 原始内容: ${content.substring(0, 200)}...`)
    }

    return null
  }

  /**
   * 格式化消息列表为文本
   * @param {Array} messages - 消息列表
   * @param {Object} options - 格式化选项
   * @returns {string} 格式化后的文本
   */
  formatMessages(messages, options = {}) {
    const {
      includeTime = true,
      includeNickname = true,
      maxMessages = null,
      filter = null
    } = options

    let formatted = []
    let processedCount = 0

    for (const msg of messages) {
      // 应用过滤器
      if (filter && !filter(msg)) {
        continue
      }

      // 检查消息数量限制
      if (maxMessages && processedCount >= maxMessages) {
        break
      }

      let line = ''

      // 添加时间
      if (includeTime) {
        const time = new Date(msg.time * 1000)
        const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`
        line += `[${timeStr}] `
      }

      // 添加昵称
      if (includeNickname) {
        line += `${msg.nickname}: `
      }

      // 添加消息内容
      line += msg.message

      formatted.push(line)
      processedCount++
    }

    return formatted.join('\n')
  }

  /**
   * 睡眠函数
   * @param {number} ms - 毫秒数
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 执行分析 (子类必须实现)
   * @param {Array} messages - 消息列表
   * @param {Object} stats - 统计信息
   * @returns {Promise<Object>} 分析结果
   */
  async analyze(messages, stats) {
    throw new Error('子类必须实现 analyze 方法')
  }
}
