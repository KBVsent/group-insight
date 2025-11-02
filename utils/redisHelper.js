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

    // 只在首次创建 key 时设置过期时间，避免每次都重置导致消息永不过期
    const ttl = await redis.ttl(key)
    if (ttl === -1) {
      // key 存在但没有过期时间，设置过期时间
      const expireSeconds = this.retentionDays * 24 * 60 * 60
      await redis.expire(key, expireSeconds)
      logger.debug(`[群聊助手] 为消息 key 设置过期时间: ${key} (${this.retentionDays} 天)`)
    }
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
   * 使用简单的 GET-SET 方式，配合 Redis 单线程特性保证基本一致性
   * @param {string} groupId - 群号
   * @param {string} userId - 被艾特的用户ID
   * @param {object} atData - 艾特数据
   */
  async saveAtRecord(groupId, userId, atData) {
    const key = this.getAtKey(groupId, userId)

    // 计算过期时间
    const expireTime = moment().add(this.atRetentionHours, 'hours').format('YYYY-MM-DD HH:mm:ss')
    const expireSeconds = Math.floor((new Date(expireTime) - new Date()) / 1000)

    // 添加过期时间到数据中
    atData.endTime = expireTime

    try {
      // 获取现有数据
      const data = await redis.get(key)
      let records = []

      if (data) {
        try {
          records = JSON.parse(data)
          // 确保是数组
          if (!Array.isArray(records)) {
            records = []
          }
        } catch (parseErr) {
          logger.error(`[群聊助手] 解析艾特记录失败: ${parseErr}，将重置记录`)
          records = []
        }
      }

      // 添加新记录
      records.push(atData)

      // 保存回 Redis
      await redis.set(key, JSON.stringify(records), { EX: expireSeconds })

      logger.debug(`[群聊助手] 保存艾特记录成功，当前记录数: ${records.length}`)
    } catch (err) {
      logger.error(`[群聊助手] 保存艾特记录失败: ${err}`)
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
   * 获取报告键名
   * @param {string} groupId - 群号
   * @param {string} date - 日期 (YYYY-MM-DD)
   */
  getReportKey(groupId, date = null) {
    const dateStr = date || moment().format('YYYY-MM-DD')
    return `${this.keyPrefix}:report:${groupId}:${dateStr}`
  }

  /**
   * 保存群聊报告
   * @param {string} groupId - 群号
   * @param {string} date - 日期 (YYYY-MM-DD)
   * @param {object} reportData - 报告数据
   * @param {number} retentionDays - 保留天数 (0 = 永久)
   */
  async saveReport(groupId, date, reportData, retentionDays = 0) {
    const key = this.getReportKey(groupId, date)

    // 使用 Hash 结构存储
    const fields = {
      analysisData: JSON.stringify({
        stats: reportData.stats || {},
        topics: reportData.topics || [],
        goldenQuotes: reportData.goldenQuotes || [],
        userTitles: reportData.userTitles || []
      }),
      messageCount: reportData.messageCount || 0,
      tokenUsage: JSON.stringify(reportData.tokenUsage || {}),
      lastUpdateTime: Date.now(),
      savedAt: Date.now(),
      date: date
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

    logger.debug(`[群聊助手] 保存报告成功: ${key}`)
  }

  /**
   * 获取群聊报告
   * @param {string} groupId - 群号
   * @param {string} date - 日期 (YYYY-MM-DD)
   * @returns {Object|null} 报告对象，不存在返回 null
   */
  async getReport(groupId, date = null) {
    const key = this.getReportKey(groupId, date)

    try {
      // 检查 key 是否存在
      const exists = await redis.exists(key)
      if (!exists) {
        logger.debug(`[群聊助手] 报告不存在: ${key}`)
        return null
      }

      // 获取整个 Hash
      const data = await redis.hGetAll(key)

      if (!data || !data.analysisData) {
        logger.warn(`[群聊助手] 报告数据损坏: ${key}`)
        return null
      }

      // 解析 JSON 数据
      const analysisData = JSON.parse(data.analysisData)
      const tokenUsage = data.tokenUsage ? JSON.parse(data.tokenUsage) : {}

      return {
        stats: analysisData.stats || {},
        topics: analysisData.topics || [],
        goldenQuotes: analysisData.goldenQuotes || [],
        userTitles: analysisData.userTitles || [],
        messageCount: parseInt(data.messageCount) || 0,
        tokenUsage: tokenUsage,
        lastUpdateTime: parseInt(data.lastUpdateTime) || 0,
        savedAt: parseInt(data.savedAt) || 0,
        date: data.date || date || moment().format('YYYY-MM-DD')
      }
    } catch (err) {
      logger.error(`[群聊助手] 获取报告失败: ${key}, ${err}`)
      return null
    }
  }
}
