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
   * 获取艾特记录索引键名 (Sorted Set)
   * @param {string} groupId - 群号
   * @param {string} userId - 用户ID
   */
  getAtIndexKey(groupId, userId) {
    return `${this.keyPrefix}:at:index:${groupId}_${userId}`
  }

  /**
   * 获取艾特记录数据键名 (Hash)
   * @param {string} recordId - 记录ID
   */
  getAtDataKey(recordId) {
    return `${this.keyPrefix}:at:data:${recordId}`
  }

  /**
   * 生成艾特记录ID
   * @param {string} groupId - 群号
   * @param {string} userId - 用户ID
   * @param {number} time - 时间戳(秒)
   */
  generateAtRecordId(groupId, userId, time) {
    return `${groupId}_${userId}_${time}`
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
      logger.debug(`[群聊洞见] 为消息 key 设置过期时间: ${key} (${this.retentionDays} 天)`)
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
          logger.error(`[群聊洞见] 解析消息失败: ${err}`)
        }
      }
    }

    return messages
  }

  /**
   * 保存艾特记录
   * 使用 Sorted Set + Hash 实现精确过期
   * @param {string} groupId - 群号
   * @param {string} userId - 被艾特的用户ID
   * @param {object} atData - 艾特数据
   */
  async saveAtRecord(groupId, userId, atData) {
    // 生成唯一记录ID
    const recordId = this.generateAtRecordId(groupId, userId, atData.time)
    const indexKey = this.getAtIndexKey(groupId, userId)
    const dataKey = this.getAtDataKey(recordId)

    // 计算过期时间
    const expireTime = moment.unix(atData.time).add(this.atRetentionHours, 'hours').format('YYYY-MM-DD HH:mm:ss')
    const expireSeconds = Math.floor((moment(expireTime).valueOf() - Date.now()) / 1000)

    // 如果已经过期，不保存
    if (expireSeconds <= 0) {
      logger.debug(`[群聊洞见] 艾特记录已过期，跳过保存: ${recordId}`)
      return
    }

    try {
      // 1. 将记录ID添加到索引 (Sorted Set)
      // Score: 消息时间戳(秒)，Member: 记录ID
      await redis.zAdd(indexKey, { score: atData.time, value: recordId })

      // 2. 保存记录详情到 Hash
      const hashData = {
        user_id: String(atData.user_id),
        nickname: atData.nickname,
        message: atData.message,
        images: JSON.stringify(atData.images || []),
        faces: JSON.stringify(atData.faces || {}),
        time: String(atData.time),
        messageId: atData.messageId || '',
        endTime: expireTime
      }

      for (const [field, value] of Object.entries(hashData)) {
        await redis.hSet(dataKey, field, value)
      }

      // 3. 设置数据键过期时间（基于消息发送时间）
      await redis.expire(dataKey, expireSeconds)

      // 4. 设置索引键过期时间（比数据键长1小时，兜底清理）
      const indexTTL = await redis.ttl(indexKey)
      if (indexTTL === -1 || indexTTL < expireSeconds) {
        await redis.expire(indexKey, expireSeconds + 3600)
      }

      logger.debug(`[群聊洞见] 保存艾特记录成功: ${recordId}，过期时间: ${expireTime}`)
    } catch (err) {
      logger.error(`[群聊洞见] 保存艾特记录失败: ${err}`)
    }
  }

  /**
   * 获取艾特记录
   * @param {string} groupId - 群号
   * @param {string} userId - 用户ID
   */
  async getAtRecords(groupId, userId) {
    const indexKey = this.getAtIndexKey(groupId, userId)

    try {
      // 计算24小时前的时间戳
      const cutoffTime = moment().subtract(this.atRetentionHours, 'hours').unix()

      // 从 Sorted Set 中查询24小时内的记录ID
      // ZRANGEBYSCORE: 按 score 范围查询
      const recordIds = await redis.zRangeByScore(indexKey, cutoffTime, '+inf')

      if (!recordIds || recordIds.length === 0) {
        return null
      }

      // 批量获取记录详情
      const records = []
      const expiredIds = []

      for (const recordId of recordIds) {
        const dataKey = this.getAtDataKey(recordId)
        const hashData = await redis.hGetAll(dataKey)

        // 如果数据已过期（Hash 被删除），记录到清理列表
        if (!hashData || Object.keys(hashData).length === 0) {
          expiredIds.push(recordId)
          continue
        }

        // 解析数据
        records.push({
          user_id: parseInt(hashData.user_id),
          nickname: hashData.nickname,
          message: hashData.message,
          images: JSON.parse(hashData.images || '[]'),
          faces: JSON.parse(hashData.faces || '{}'),
          time: parseInt(hashData.time),
          messageId: hashData.messageId || '',
          endTime: hashData.endTime
        })
      }

      // 清理索引中已过期的记录ID
      if (expiredIds.length > 0) {
        await redis.zRem(indexKey, expiredIds)
        logger.debug(`[群聊洞见] 清理过期索引: ${expiredIds.length} 条`)
      }

      return records.length > 0 ? records : null
    } catch (err) {
      logger.error(`[群聊洞见] 获取艾特记录失败: ${err}`)
      return null
    }
  }

  /**
   * 清除用户的艾特记录
   * @param {string} groupId - 群号
   * @param {string} userId - 用户ID
   */
  async clearAtRecords(groupId, userId) {
    const indexKey = this.getAtIndexKey(groupId, userId)

    try {
      // 获取所有记录ID
      const recordIds = await redis.zRange(indexKey, 0, -1)

      // 删除所有数据键
      for (const recordId of recordIds) {
        const dataKey = this.getAtDataKey(recordId)
        await redis.del(dataKey)
      }

      // 删除索引键
      await redis.del(indexKey)

      logger.debug(`[群聊洞见] 清除艾特记录成功: ${recordIds.length} 条`)
      return recordIds.length
    } catch (err) {
      logger.error(`[群聊洞见] 清除艾特记录失败: ${err}`)
      return 0
    }
  }

  /**
   * 清除所有艾特记录
   */
  async clearAllAtRecords() {
    try {
      let totalDeleted = 0

      // 1. 清除所有索引键和对应的数据键
      const indexPattern = `${this.keyPrefix}:at:index:*`
      const indexKeys = await redis.keys(indexPattern)

      for (const indexKey of indexKeys) {
        // 获取所有记录ID
        const recordIds = await redis.zRange(indexKey, 0, -1)

        // 删除所有数据键
        for (const recordId of recordIds) {
          const dataKey = this.getAtDataKey(recordId)
          await redis.del(dataKey)
          totalDeleted++
        }

        // 删除索引键
        await redis.del(indexKey)
      }

      // 2. 清除可能残留的旧格式数据键
      const dataPattern = `${this.keyPrefix}:at:data:*`
      const dataKeys = await redis.keys(dataPattern)
      for (const key of dataKeys) {
        await redis.del(key)
      }

      // 3. 清除旧版本的艾特记录键（兼容性清理）
      const oldPattern = `${this.keyPrefix}:at:*`
      const oldKeys = await redis.keys(oldPattern)
      const oldAtKeys = oldKeys.filter(key =>
        !key.includes(':index:') && !key.includes(':data:')
      )
      for (const key of oldAtKeys) {
        await redis.del(key)
      }

      logger.info(`[群聊洞见] 清除所有艾特记录成功: ${totalDeleted} 条`)
      return totalDeleted
    } catch (err) {
      logger.error(`[群聊洞见] 清除所有艾特记录失败: ${err}`)
      return 0
    }
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

    logger.debug(`[群聊洞见] 保存报告成功: ${key}`)
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
        logger.debug(`[群聊洞见] 报告不存在: ${key}`)
        return null
      }

      // 获取整个 Hash
      const data = await redis.hGetAll(key)

      if (!data || !data.analysisData) {
        logger.warn(`[群聊洞见] 报告数据损坏: ${key}`)
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
      logger.error(`[群聊洞见] 获取报告失败: ${key}, ${err}`)
      return null
    }
  }
}
