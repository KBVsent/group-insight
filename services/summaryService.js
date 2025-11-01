/**
 * 总结服务
 * 负责生成、保存和查询群聊总结
 */

import moment from 'moment'
import RedisHelper from '../utils/redisHelper.js'
import AIService from './aiService.js'
import MessageCollector from './messageCollector.js'

export default class SummaryService {
  constructor(config) {
    this.config = config || {}
    this.redisHelper = new RedisHelper(
      config.retentionDays || 7,
      config.atRetentionHours || 24
    )

    // AI 服务（延迟初始化）
    this.aiService = null

    // 消息收集器（延迟初始化）
    this.messageCollector = null

    // 总结配置
    this.summaryConfig = config.summary || {}
    this.includeContext = this.summaryConfig.includeContext !== false
    this.retentionDays = this.summaryConfig.retentionDays || 0
  }

  /**
   * 初始化服务
   * @param {AIService} aiService - AI 服务实例
   * @param {MessageCollector} messageCollector - 消息收集器实例
   */
  init(aiService, messageCollector) {
    this.aiService = aiService
    this.messageCollector = messageCollector
    logger.info('[群聊助手] SummaryService 初始化完成')
  }

  /**
   * 生成每日总结（增量更新）
   * @param {string} groupId - 群号
   * @param {string} groupName - 群名
   * @param {boolean} forceUpdate - 是否强制更新
   * @returns {object} 总结结果
   */
  async generateDailySummary(groupId, groupName = '未知群聊', forceUpdate = false) {
    try {
      if (!this.aiService || !this.messageCollector) {
        throw new Error('服务未初始化')
      }

      const today = moment().format('YYYY-MM-DD')
      const currentHour = moment().hour()

      logger.info(`[群聊助手] 开始生成群 ${groupId} 的每日总结 (${today} ${currentHour}:00)`)

      // 获取今天的消息（从 0:00 到当前时间）
      const messages = await this.messageCollector.getMessages(groupId, 1)

      if (messages.length === 0) {
        logger.warn(`[群聊助手] 群 ${groupId} 今天没有消息，跳过总结`)
        return {
          success: false,
          error: '今天还没有消息'
        }
      }

      // 按时间戳排序（确保时序正确）
      messages.sort((a, b) => a.timestamp - b.timestamp)

      logger.info(`[群聊助手] 获取到 ${messages.length} 条消息`)

      // 获取上次总结作为上下文
      let previousSummary = null
      if (this.includeContext) {
        const existingSummary = await this.redisHelper.getDailySummary(groupId, today)
        if (existingSummary) {
          previousSummary = existingSummary.content
          logger.info(`[群聊助手] 找到今天早些时候的总结，作为上下文`)
        }
      }

      // 调用 AI 生成总结
      const result = await this.aiService.summarize(messages, {
        groupName,
        days: 1,
        previousSummary
      })

      if (!result.success) {
        logger.error(`[群聊助手] AI 总结失败: ${result.error}`)
        return result
      }

      // 保存总结
      await this.saveSummary(groupId, today, {
        content: result.summary,
        messageCount: messages.length,
        lastUpdateHour: currentHour,
        lastUpdateTime: Date.now(),
        provider: result.provider,
        model: result.model
      })

      logger.info(`[群聊助手] 群 ${groupId} 的每日总结生成成功`)

      return {
        success: true,
        summary: result.summary,
        messageCount: messages.length,
        hour: currentHour,
        date: today,
        provider: result.provider,
        model: result.model
      }
    } catch (err) {
      logger.error(`[群聊助手] 生成每日总结失败: ${err}`)
      return {
        success: false,
        error: err.message
      }
    }
  }

  /**
   * 保存总结
   * @param {string} groupId - 群号
   * @param {string} date - 日期
   * @param {object} summaryData - 总结数据
   */
  async saveSummary(groupId, date, summaryData) {
    await this.redisHelper.saveDailySummary(
      groupId,
      date,
      summaryData,
      this.retentionDays
    )
  }

  /**
   * 获取指定日期的总结
   * @param {string} groupId - 群号
   * @param {string} date - 日期 (YYYY-MM-DD)，null 为今天
   */
  async getSummary(groupId, date = null) {
    return await this.redisHelper.getDailySummary(groupId, date)
  }

  /**
   * 获取最新的总结
   * @param {string} groupId - 群号
   */
  async getLatestSummary(groupId) {
    return await this.redisHelper.getLatestSummary(groupId)
  }

  /**
   * 获取多天的总结
   * @param {string} groupId - 群号
   * @param {number} days - 天数
   */
  async getMultipleDaySummaries(groupId, days = 3) {
    const summaries = []

    for (let i = 0; i < days; i++) {
      const date = moment().subtract(i, 'days').format('YYYY-MM-DD')
      const summary = await this.getSummary(groupId, date)

      if (summary) {
        // 添加日期标签
        summary.dateLabel = this.getDateLabel(i)
        summaries.push(summary)
      }
    }

    return summaries
  }

  /**
   * 获取日期标签
   * @param {number} daysAgo - 距今天数
   */
  getDateLabel(daysAgo) {
    if (daysAgo === 0) return '今天'
    if (daysAgo === 1) return '昨天'
    if (daysAgo === 2) return '前天'
    return `${daysAgo}天前`
  }

  /**
   * 检查群是否在白名单中
   * @param {string} groupId - 群号
   */
  isGroupInWhitelist(groupId) {
    const scheduleConfig = this.config.schedule || {}
    const whitelist = scheduleConfig.whitelist || []

    // 白名单为空则不启用
    if (whitelist.length === 0) {
      return false
    }

    // 检查群是否在白名单中
    return whitelist.includes(String(groupId))
  }

  /**
   * 获取所有启用的群列表
   */
  getEnabledGroups() {
    const scheduleConfig = this.config.schedule || {}
    const whitelist = scheduleConfig.whitelist || []
    return whitelist.map(id => String(id))
  }
}
