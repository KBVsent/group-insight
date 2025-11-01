/**
 * Redis 操作封装类
 * 提供群聊消息和艾特记录的存储与查询
 */

import moment from 'moment'

export default class RedisHelper {
  constructor(retentionDays = 7, atRetentionHours = 24) {
    this.retentionDays = retentionDays
    this.atRetentionHours = atRetentionHours
    this.keyPrefix = 'Yz:groupManager'
  }

  /**
   * 获取消息历史键名
   * @param {string} groupId - 群号
   * @param {string} date - 日期 (YYYY-MM-DD)
   */
  getMessageKey(groupId, date = null) {
    const dateStr = date || moment().format('YYYY-MM-DD')
    return `${this.keyPrefix}:msg:${groupId}:${dateStr}`
  }

  /**
   * 获取艾特记录键名
   * @param {string} groupId - 群号
   * @param {string} userId - 用户ID
   */
  getAtKey(groupId, userId) {
    return `${this.keyPrefix}:at:${groupId}_${userId}`
  }

  /**
   * 存储群消息
   * @param {string} groupId - 群号
   * @param {object} messageData - 消息数据
   */
  async saveMessage(groupId, messageData) {
    const key = this.getMessageKey(groupId)
    const data = JSON.stringify(messageData)

    // 添加到列表
    await redis.rPush(key, data)

    // 设置过期时间
    const expireSeconds = this.retentionDays * 24 * 60 * 60
    await redis.expire(key, expireSeconds)
  }

  /**
   * 获取群消息历史
   * @param {string} groupId - 群号
   * @param {number} days - 查询天数 (1, 3, 7)
   */
  async getMessages(groupId, days = 1) {
    const messages = []

    for (let i = 0; i < days; i++) {
      const date = moment().subtract(i, 'days').format('YYYY-MM-DD')
      const key = this.getMessageKey(groupId, date)

      const dayMessages = await redis.lRange(key, 0, -1)
      for (const msg of dayMessages) {
        try {
          messages.push(JSON.parse(msg))
        } catch (err) {
          logger.error(`[群聊助手] 解析消息失败: ${err}`)
        }
      }
    }

    return messages
  }

  /**
   * 保存艾特记录
   * @param {string} groupId - 群号
   * @param {string} userId - 被艾特的用户ID
   * @param {object} atData - 艾特数据
   */
  async saveAtRecord(groupId, userId, atData) {
    const key = this.getAtKey(groupId, userId)
    let data = await redis.get(key)

    // 计算过期时间
    const expireTime = moment().add(this.atRetentionHours, 'hours').format('YYYY-MM-DD HH:mm:ss')
    const expireSeconds = Math.floor((new Date(expireTime) - new Date()) / 1000)

    if (data) {
      // 已有数据，追加
      try {
        const records = JSON.parse(data)
        records.push(atData)
        await redis.set(key, JSON.stringify(records), { EX: expireSeconds })
      } catch (err) {
        logger.error(`[群聊助手] 保存艾特记录失败: ${err}`)
      }
    } else {
      // 新建数据
      atData.endTime = expireTime
      await redis.set(key, JSON.stringify([atData]), { EX: expireSeconds })
    }
  }

  /**
   * 获取艾特记录
   * @param {string} groupId - 群号
   * @param {string} userId - 用户ID
   */
  async getAtRecords(groupId, userId) {
    const key = this.getAtKey(groupId, userId)
    const data = await redis.get(key)

    if (!data) return null

    try {
      return JSON.parse(data)
    } catch (err) {
      logger.error(`[群聊助手] 获取艾特记录失败: ${err}`)
      return null
    }
  }

  /**
   * 清除用户的艾特记录
   * @param {string} groupId - 群号
   * @param {string} userId - 用户ID
   */
  async clearAtRecords(groupId, userId) {
    const key = this.getAtKey(groupId, userId)
    return await redis.del(key)
  }

  /**
   * 清除所有艾特记录
   */
  async clearAllAtRecords() {
    const pattern = `${this.keyPrefix}:at:*`
    const keys = await redis.keys(pattern)

    if (keys.length === 0) return 0

    for (const key of keys) {
      await redis.del(key)
    }

    return keys.length
  }

  /**
   * 获取消息数量统计
   * @param {string} groupId - 群号
   * @param {number} days - 天数
   */
  async getMessageCount(groupId, days = 1) {
    let total = 0

    for (let i = 0; i < days; i++) {
      const date = moment().subtract(i, 'days').format('YYYY-MM-DD')
      const key = this.getMessageKey(groupId, date)
      const count = await redis.lLen(key)
      total += count
    }

    return total
  }

  /**
   * 获取总结键名
   * @param {string} groupId - 群号
   * @param {string} date - 日期 (YYYY-MM-DD)
   */
  getSummaryKey(groupId, date = null) {
    const dateStr = date || moment().format('YYYY-MM-DD')
    return `${this.keyPrefix}:summary:${groupId}:${dateStr}`
  }

  /**
   * 保存每日总结
   * @param {string} groupId - 群号
   * @param {string} date - 日期 (YYYY-MM-DD)
   * @param {object} summaryData - 总结数据
   * @param {number} retentionDays - 保留天数 (0 = 永久)
   */
  async saveDailySummary(groupId, date, summaryData, retentionDays = 0) {
    const key = this.getSummaryKey(groupId, date)

    // 添加保存时间戳
    summaryData.savedAt = Date.now()

    // 保存为 Hash 结构
    const fields = {
      content: summaryData.content || '',
      messageCount: summaryData.messageCount || 0,
      lastUpdateHour: summaryData.lastUpdateHour || 0,
      lastUpdateTime: summaryData.lastUpdateTime || Date.now(),
      provider: summaryData.provider || '',
      model: summaryData.model || '',
      savedAt: summaryData.savedAt
    }

    // 批量设置字段
    for (const [field, value] of Object.entries(fields)) {
      await redis.hSet(key, field, String(value))
    }

    // 设置过期时间（如果不是永久保存）
    if (retentionDays > 0) {
      const expireSeconds = retentionDays * 24 * 60 * 60
      await redis.expire(key, expireSeconds)
    }

    logger.debug(`[群聊助手] 保存总结成功: ${key}`)
  }

  /**
   * 获取指定日期的总结
   * @param {string} groupId - 群号
   * @param {string} date - 日期 (YYYY-MM-DD)
   */
  async getDailySummary(groupId, date = null) {
    const key = this.getSummaryKey(groupId, date)

    try {
      const exists = await redis.exists(key)
      if (!exists) {
        logger.debug(`[群聊助手] 总结不存在: ${key}`)
        return null
      }

      const data = await redis.hGetAll(key)

      if (!data || Object.keys(data).length === 0) {
        logger.debug(`[群聊助手] 总结数据为空: ${key}`)
        return null
      }

      // 转换数字类型
      return {
        content: data.content || '',
        messageCount: parseInt(data.messageCount) || 0,
        lastUpdateHour: parseInt(data.lastUpdateHour) || 0,
        lastUpdateTime: parseInt(data.lastUpdateTime) || 0,
        provider: data.provider || '',
        model: data.model || '',
        savedAt: parseInt(data.savedAt) || 0,
        date: date || moment().format('YYYY-MM-DD')
      }
    } catch (err) {
      logger.error(`[群聊助手] 获取总结失败: ${err}`)
      return null
    }
  }

  /**
   * 获取最新的总结（如果今天没有，返回最近一次的）
   * @param {string} groupId - 群号
   * @param {number} searchDays - 最多向前搜索的天数
   */
  async getLatestSummary(groupId, searchDays = 7) {
    for (let i = 0; i < searchDays; i++) {
      const date = moment().subtract(i, 'days').format('YYYY-MM-DD')
      const summary = await this.getDailySummary(groupId, date)

      if (summary) {
        logger.debug(`[群聊助手] 找到最新总结: ${date}`)
        return summary
      }
    }

    logger.debug(`[群聊助手] 未找到最近${searchDays}天的总结`)
    return null
  }

  /**
   * 获取多天的总结
   * @param {string} groupId - 群号
   * @param {number} days - 天数
   */
  async getSummaries(groupId, days = 3) {
    const summaries = []

    for (let i = 0; i < days; i++) {
      const date = moment().subtract(i, 'days').format('YYYY-MM-DD')
      const summary = await this.getDailySummary(groupId, date)

      if (summary) {
        summaries.push(summary)
      }
    }

    return summaries
  }

  /**
   * 删除总结
   * @param {string} groupId - 群号
   * @param {string} date - 日期 (YYYY-MM-DD)
   */
  async deleteSummary(groupId, date = null) {
    const key = this.getSummaryKey(groupId, date)
    return await redis.del(key)
  }
}
