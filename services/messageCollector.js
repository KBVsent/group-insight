/**
 * 消息收集器
 * 监听群消息并保存到 Redis
 * 同时处理艾特记录
 */

import RedisHelper from '../utils/redisHelper.js'
import ImageRkeyManager from '../utils/imageRkeyManager.js'
import moment from 'moment'

export default class MessageCollector {
  constructor(config) {
    this.config = config || {}
    const msgConfig = config.messageCollection || {}
    this.redisHelper = new RedisHelper(
      config.retentionDays || 7,
      config.atRetentionHours || 24
    )
    this.rkeyManager = new ImageRkeyManager()
    this.maxMessageLength = msgConfig.maxMessageLength || 500
    this.collectImages = msgConfig.collectImages !== undefined ? msgConfig.collectImages : false
    this.collectFaces = msgConfig.collectFaces !== undefined ? msgConfig.collectFaces : false
    this.contextMessageCount = config.contextMessageCount || 1  // 新增: 上下文消息数量

    // 定时总结白名单配置
    this.scheduleConfig = config.schedule || {}
    this.whitelist = this.scheduleConfig.whitelist || []

    // 防止重复注册监听器
    this.isCollecting = false
    this.handler = null  // 保存处理器引用，用于移除监听器

    logger.info(`[群聊洞见] 消息收集配置 - 收集图片: ${this.collectImages}, 收集表情: ${this.collectFaces}, 上下文消息: ${this.contextMessageCount}`)
    if (this.whitelist.length > 0) {
      logger.info(`[群聊洞见] 定时总结白名单: ${this.whitelist.length} 个群`)
    }
  }

  /**
   * 开始监听群消息
   */
  startCollecting() {
    // 避免重复注册监听器
    if (this.isCollecting) {
      logger.warn('[群聊洞见] 消息收集器已经在运行，跳过重复注册')
      return
    }

    // 保存处理器引用，以便后续移除
    this.handler = async (e) => {
      try {
        await this.handleMessage(e)
      } catch (err) {
        logger.error(`[群聊洞见] 消息收集失败: ${err}`)
      }
    }

    Bot.on('message.group', this.handler)
    this.isCollecting = true

    logger.info('[群聊洞见] 消息收集器已启动')
  }

  /**
   * 停止监听群消息
   */
  stopCollecting() {
    if (!this.handler) {
      return
    }

    try {
      Bot.off('message.group', this.handler)
      this.handler = null
      this.isCollecting = false
      logger.info('[群聊洞见] 消息收集器已停止')
    } catch (err) {
      logger.error(`[群聊洞见] 停止收集器时发生错误: ${err}`)
    }
  }

  /**
   * 处理群消息
   * @param {object} e - 事件对象
   */
  async handleMessage(e) {
    // 提取消息内容
    const message = this.extractMessage(e)

    // 更新图片和动画表情的 rkey（异步执行，不阻塞消息处理）
    const allImageUrls = [
      ...message.images,                    // 普通图片
      ...(message.faces.mface || [])        // 动画表情
    ]

    if (allImageUrls.length > 0) {
      this.rkeyManager.updateBatch(allImageUrls).catch(err => {
        logger.error(`[群聊洞见] 更新 rkey 失败: ${err}`)
      })
    }

    // 保存消息
    // 只要有文本、表情或图片，就保存消息
    const hasContent = message.text ||
                      message.faces.total > 0 ||
                      message.images.length > 0

    if (hasContent) {
      await this.saveMessage(e, message)

      // 检查是否有待更新的 @ 记录（收集下一条消息）
      await this.checkAndUpdatePendingAts(e, message)

      // 检查是否达到消息阈值，触发部分分析
      await this.checkThresholdTrigger(e.group_id)
    }

    // 处理艾特
    if (message.atUsers.length > 0) {
      await this.handleAt(e, message)
    }
  }

  /**
   * 提取消息内容
   * @param {object} e - 事件对象
   */
  extractMessage(e) {
    let text = ''
    const atUsers = []
    const images = []
    const faces = {
      face: [],      // 普通表情（从 raw 字段解析）
      mface: [],     // 动画表情（从 image 的 summary 判断）
      emoji: [],     // Emoji 表情（从文本中提取）
      total: 0       // 总表情数
    }
    let hasReply = false

    // 遍历消息段
    for (const msg of e.message) {
      if (msg.type === 'text') {
        text += msg.text

        // 如果启用表情收集，统计文本中的 Emoji
        if (this.collectFaces && msg.text) {
          const emojiCount = this.countEmojis(msg.text)
          if (emojiCount > 0) {
            faces.emoji.push(emojiCount)
            faces.total += emojiCount
            logger.debug(`[群聊洞见] 检测到 ${emojiCount} 个 Emoji 表情`)
          }
        }
      } else if (msg.type === 'at') {
        atUsers.push(msg.qq)
      } else if (msg.type === 'image') {
        // 判断是否是动画表情
        if (this.collectFaces && msg.summary && /动画表情|表情|sticker|emoji/i.test(msg.summary)) {
          const mfaceUrl = msg.url || msg.file  // 优先使用 url（包含完整路径和 rkey）
          if (mfaceUrl) {
            faces.mface.push(mfaceUrl)
            faces.total++
            logger.debug(`[群聊洞见] 收集动画表情: ${msg.summary}`)
          }
        } else if (this.collectImages) {
          // 普通图片
          const imgUrl = msg.url || msg.file
          if (imgUrl) {
            images.push(imgUrl)
            logger.debug(`[群聊洞见] 收集图片`)
          }
        }
      } else if (msg.type === 'reply') {
        hasReply = true
      } else if (msg.type === 'face') {
        // QQ 原生表情（包括小表情和动画表情）
        if (this.collectFaces) {
          // 提取 face id（直接从 msg.id 获取）
          const faceId = msg.id ? String(msg.id) : null

          if (faceId) {
            // 判断是小表情还是动画表情（通过 raw.faceType）
            const faceType = msg.raw?.faceType

            if (faceType === 3) {
              // faceType=3 表示动画表情（如"敲敲"）
              // 注意：这里我们仍然将其记录为 face，因为它没有可用的图片 URL
              // 如果需要区分，可以单独统计
              faces.face.push(faceId)
              faces.total++
              logger.debug(`[群聊洞见] 收集 QQ 动画表情: face ${faceId} (${msg.raw?.faceText || ''})`)
            } else {
              // faceType=2 或其他，普通小表情
              faces.face.push(faceId)
              faces.total++
              logger.debug(`[群聊洞见] 收集 QQ 小表情: face ${faceId} (${msg.raw?.faceText || ''})`)
            }
          } else {
            // 无法提取，输出调试信息
            logger.debug(`[群聊洞见] 无法提取 face id，消息段结构: ${JSON.stringify(msg).substring(0, 200)}`)
          }
        }
      }

      // 调试：打印所有消息段结构（仅在 DEBUG 模式）
      if (this.collectFaces && process.env.DEBUG_MESSAGE_COLLECTOR) {
        logger.debug(`[群聊洞见] 消息段: type=${msg.type}, raw=${msg.raw}, summary=${msg.summary}, keys=${Object.keys(msg).join(',')}`)
      }
    }

    // 清理文本
    text = text.replace(/\[(.*?)\]/g, '').trim()

    // 限制长度
    if (text.length > this.maxMessageLength) {
      text = text.substring(0, this.maxMessageLength) + '...'
    }

    return {
      text,
      atUsers,
      images,
      faces,
      hasReply,
      atAll: e.atall || false
    }
  }

  /**
   * 统计文本中的 Emoji 数量
   * @param {string} text - 文本内容
   * @returns {number} Emoji 数量
   */
  countEmojis(text) {
    if (!text) return 0

    // Emoji 的 Unicode 范围（支持大部分常见 Emoji）
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu

    const matches = text.match(emojiRegex)
    return matches ? matches.length : 0
  }

  /**
   * 保存消息到 Redis
   * @param {object} e - 事件对象
   * @param {object} message - 消息数据
   */
  async saveMessage(e, message) {
    // 获取消息时间的小时数
    const msgDate = new Date(e.time * 1000)
    const hour = msgDate.getHours()

    // 如果没有文本但有表情，使用占位符（避免空消息导致统计异常）
    const messageText = message.text || '[表情]'

    const messageData = {
      user_id: e.user_id,
      nickname: e.sender.nickname || e.nickname,
      message: messageText,
      time: e.time,
      timestamp: Date.now(),
      hour,  // 消息小时 (0-23)
      length: messageText.length,  // 消息长度
      hasReply: message.hasReply  // 是否是回复消息
    }

    if (message.images.length > 0) {
      messageData.images = message.images
    }

    // 保存表情数据（新格式）
    if (message.faces.total > 0) {
      messageData.faces = {
        face: message.faces.face,      // 普通表情 ID 数组
        mface: message.faces.mface,    // 动画表情 URL 数组
        emoji: message.faces.emoji,    // Emoji 数量数组
        total: message.faces.total     // 总表情数
      }
    }

    await this.redisHelper.saveMessage(e.group_id, messageData)
  }

  /**
   * 处理艾特记录
   * @param {object} e - 事件对象
   * @param {object} message - 消息数据
   */
  async handleAt(e, message) {
    let atUsers = message.atUsers

    // 处理艾特全体成员
    if (message.atAll) {
      const groupMembers = []
      const gm = await e.group.getMemberMap()
      for (const [userId] of gm) {
        groupMembers.push(userId)
      }
      atUsers = groupMembers
    }

    // 获取回复消息
    let replyMessageId = ''
    if (e.source) {
      try {
        const reply = (await e.group.getChatHistory(e.source.seq, 1)).pop()
        replyMessageId = reply ? reply.message_id : ''
      } catch (err) {
        logger.debug(`[群聊洞见] 获取回复消息失败: ${err}`)
      }
    }

    // 判断是否为纯@ (无文字内容)
    const isPureAt = !message.text || message.text.trim() === ''

    // 获取发起人的上下文消息(在@消息之前的消息)
    let contextMessages = []
    if (this.contextMessageCount > 0 && isPureAt) {
      contextMessages = await this.getRecentUserMessages(
        e.group_id,
        e.user_id.toString(),
        this.contextMessageCount,
        e.time  // 只获取当前@消息之前的消息
      )
      logger.debug(`[群聊洞见] 获取到 ${contextMessages.length} 条上下文消息`)
    }

    // 保存艾特记录
    for (const userId of atUsers) {
      const atData = {
        user_id: e.user_id,
        nickname: e.sender.nickname || e.nickname,
        message: message.text,
        images: message.images,
        faces: message.faces,
        time: e.time,
        messageId: replyMessageId,
        contextMessages: contextMessages  // 新增: 上下文消息
      }

      const recordId = await this.redisHelper.saveAtRecord(e.group_id, userId.toString(), atData)

      // 如果是纯@，保存到 pending 列表等待收集下一条消息
      if (isPureAt && this.contextMessageCount > 0) {
        const nextMessageTimeout = this.config.nextMessageTimeout || 300
        const expireTime = e.time + nextMessageTimeout
        await this.redisHelper.savePendingAt(e.group_id, e.user_id.toString(), recordId, expireTime)
        logger.debug(`[群聊洞见] 纯@消息，等待收集下一条消息，超时时间: ${nextMessageTimeout}秒`)
      }
    }
  }

  /**
   * 获取群消息历史
   * @param {string} groupId - 群号
   * @param {number} days - 天数
   */
  async getMessages(groupId, days = 1) {
    return await this.redisHelper.getMessages(groupId, days)
  }

  /**
   * 获取艾特记录
   * @param {string} groupId - 群号
   * @param {string} userId - 用户ID
   */
  async getAtRecords(groupId, userId) {
    return await this.redisHelper.getAtRecords(groupId, userId)
  }

  /**
   * 清除艾特记录
   * @param {string} groupId - 群号
   * @param {string} userId - 用户ID
   */
  async clearAtRecords(groupId, userId) {
    return await this.redisHelper.clearAtRecords(groupId, userId)
  }

  /**
   * 清除所有艾特记录
   */
  async clearAllAtRecords() {
    return await this.redisHelper.clearAllAtRecords()
  }

  /**
   * 检查群是否在定时总结白名单中
   * @param {string} groupId - 群号
   */
  isGroupInWhitelist(groupId) {
    // 白名单为空则不启用定时总结
    if (this.whitelist.length === 0) {
      return false
    }

    // 检查群是否在白名单中
    return this.whitelist.includes(String(groupId))
  }

  /**
   * 获取所有白名单群列表
   */
  getWhitelistGroups() {
    return this.whitelist.map(id => String(id))
  }

  /**
   * 获取指定用户最近的N条消息
   * @param {string} groupId - 群号
   * @param {string} userId - 用户ID
   * @param {number} count - 消息数量
   * @param {number} beforeTime - 时间戳(秒),只获取该时间点之前的消息
   * @returns {Array} 消息数组,按时间倒序排列
   */
  async getRecentUserMessages(groupId, userId, count = 1, beforeTime = null) {
    try {
      const userMessages = []
      const targetUserId = parseInt(userId)

      logger.debug(`[群聊洞见] 开始查询用户 ${targetUserId} 在 ${beforeTime} 之前的 ${count} 条消息`)

      // 获取最近7天的消息(从retentionDays配置读取)
      const days = this.redisHelper.retentionDays

      // 从今天开始往前查询
      for (let i = 0; i < days && userMessages.length < count; i++) {
        const date = moment().subtract(i, 'days').format('YYYY-MM-DD')
        const key = this.redisHelper.getMessageKey(groupId, date)

        let dayMessages = []
        try {
          // 获取该日的所有消息
          dayMessages = await redis.lRange(key, 0, -1)
          logger.debug(`[群聊洞见] 查询日期 ${date}，获取到 ${dayMessages.length} 条消息`)
        } catch (err) {
          logger.error(`[群聊洞见] Redis查询失败: ${err}`)
          continue
        }

        // 倒序遍历(从最新的消息开始)
        for (let j = dayMessages.length - 1; j >= 0 && userMessages.length < count; j--) {
          try {
            const msg = JSON.parse(dayMessages[j])

            // 检查是否是目标用户的消息
            if (msg.user_id === targetUserId) {
              logger.debug(`[群聊洞见] 找到用户消息: time=${msg.time}, beforeTime=${beforeTime}, message=${msg.message}`)

              // 如果指定了时间限制,只获取该时间之前的消息
              if (beforeTime && msg.time >= beforeTime) {
                logger.debug(`[群聊洞见] 消息时间 ${msg.time} >= ${beforeTime}，跳过`)
                continue
              }

              userMessages.push({
                message: msg.message,
                time: msg.time,
                images: msg.images || [],
                faces: msg.faces || {}
              })

              logger.debug(`[群聊洞见] 已收集 ${userMessages.length}/${count} 条消息`)
            }
          } catch (err) {
            logger.debug(`[群聊洞见] 解析消息失败: ${err}`)
          }
        }
      }

      // 按时间倒序排列(最新的在前)
      userMessages.sort((a, b) => b.time - a.time)

      logger.debug(`[群聊洞见] 最终获取到 ${userMessages.length} 条上下文消息`)
      return userMessages.slice(0, count)
    } catch (err) {
      logger.error(`[群聊洞见] 获取用户最近消息失败: ${err}`)
      return []
    }
  }

  /**
   * 获取 rkey 管理器实例
   * @returns {ImageRkeyManager} rkey 管理器
   */
  getRkeyManager() {
    return this.rkeyManager
  }

  /**
   * 检查并更新待处理的 @ 记录
   * @param {object} e - 事件对象
   * @param {object} message - 消息数据
   */
  async checkAndUpdatePendingAts(e, message) {
    try {
      // 获取该用户的待更新 @ 记录
      const pendingRecordIds = await this.redisHelper.getPendingAts(e.group_id, e.user_id.toString())

      if (pendingRecordIds.length === 0) {
        return
      }

      logger.debug(`[群聊洞见] 发现 ${pendingRecordIds.length} 条待更新的 @ 记录`)

      // 收集当前消息作为"下一条消息"
      const nextMessages = this.collectNextMessages(message, e.time)

      // 更新所有待处理的 @ 记录
      for (const recordId of pendingRecordIds) {
        const success = await this.redisHelper.updateAtRecordNextMessage(recordId, nextMessages)

        if (success) {
          // 从 pending 列表中移除
          await this.redisHelper.removePendingAt(e.group_id, e.user_id.toString(), recordId)
          logger.debug(`[群聊洞见] 成功更新 @ 记录的下一条消息: ${recordId}`)
        }
      }
    } catch (err) {
      logger.error(`[群聊洞见] 检查并更新 pending @ 记录失败: ${err}`)
    }
  }

  /**
   * 收集下一条消息的数据
   * @param {object} message - 消息对象
   * @param {number} time - 时间戳
   * @returns {Array} 消息数组（格式与 contextMessages 一致）
   */
  collectNextMessages(message, time) {
    const messages = []

    // 构建与 contextMessages 相同格式的数据结构
    // 只收集配置数量的消息（当前只有一条）
    for (let i = 0; i < this.contextMessageCount; i++) {
      messages.push({
        message: message.text || '',
        time: time,
        images: message.images || [],
        faces: message.faces || {}
      })
      break // 当前消息只有一条，所以直接 break
    }

    return messages
  }

  /**
   * 检查是否达到消息阈值，触发部分分析
   * @param {string} groupId - 群号
   */
  async checkThresholdTrigger(groupId) {
    try {
      // 不在白名单不触发
      const whitelist = this.config?.schedule?.whitelist || []
      if (whitelist.length > 0 && !whitelist.includes(groupId.toString())) {
        return
      }

      const maxMessages = this.config.ai?.maxMessages || 1000
      const today = moment().format('YYYY-MM-DD')

      // 获取今天的消息数量
      const messageCount = await this.getMessageCount(groupId, today)

      // 检查是否达到阈值的倍数（1000, 2000, 3000...）
      if (messageCount > 0 && messageCount % maxMessages === 0) {
        const batchIndex = Math.floor(messageCount / maxMessages) - 1 // 0-based index

        // 检查该批次是否已经生成过缓存
        const cacheKey = `Yz:groupManager:batch:${groupId}:${today}:${batchIndex}`
        const exists = await redis.exists(cacheKey)

        if (!exists) {
          logger.info(`[群聊洞见] 群${groupId}达到${messageCount}条消息（批次${batchIndex}），触发部分分析`)

          // 异步触发部分分析（不阻塞消息处理）
          this.triggerPartialAnalysis(groupId, batchIndex, today).catch(err => {
            logger.error(`[群聊洞见] 批次${batchIndex}自动触发分析失败: ${err}`)
          })
        }
      }
    } catch (err) {
      logger.error(`[群聊洞见] 检查阈值触发失败: ${err}`)
    }
  }

  /**
   * 获取指定日期的消息数量
   * @param {string} groupId - 群号
   * @param {string} date - 日期 (YYYY-MM-DD)
   * @returns {number} 消息数量
   */
  async getMessageCount(groupId, date) {
    try {
      const key = this.redisHelper.getMessageKey(groupId, date)
      const count = await redis.lLen(key)
      return count || 0
    } catch (err) {
      logger.error(`[群聊洞见] 获取消息数量失败: ${err}`)
      return 0
    }
  }

  /**
   * 触发部分分析（仅话题和金句）
   * @param {string} groupId - 群号
   * @param {number} batchIndex - 批次索引（0-based: 0表示0-1000, 1表示1000-2000）
   * @param {string} date - 日期
   */
  async triggerPartialAnalysis(groupId, batchIndex, date) {
    try {
      // 动态导入分析器（避免循环依赖）
      const { default: Services } = await import('../components/Services.js')

      const maxMessages = this.config.ai?.maxMessages || 1000
      const contextOverlap = 50 // 上下文重叠消息数

      // 计算该批次的消息范围
      const startIndex = batchIndex * maxMessages
      const endIndex = (batchIndex + 1) * maxMessages

      logger.info(`[群聊洞见] 批次${batchIndex}: 准备分析消息 [${startIndex}-${endIndex}]`)

      // 获取所有消息（正序：最早到最新）
      const allMessages = await this.getMessages(groupId, 1)

      // 提取该批次的消息，包含上下文
      // batch 0: [0, 1000]
      // batch 1: [950, 2000] (包含50条上下文)
      // batch 2: [1950, 3000] (包含50条上下文)
      const contextStart = Math.max(0, startIndex - contextOverlap)
      const messagesToAnalyze = allMessages.slice(contextStart, endIndex)

      if (messagesToAnalyze.length === 0) {
        logger.warn(`[群聊洞见] 批次${batchIndex}消息为空，跳过分析`)
        return
      }

      const actualStart = contextStart
      const actualEnd = Math.min(allMessages.length, endIndex)
      logger.info(`[群聊洞见] 批次${batchIndex}开始分析 [${actualStart}-${actualEnd}] 共 ${messagesToAnalyze.length} 条消息（含${startIndex - contextStart}条上下文）`)

      // 并行分析话题和金句
      const [topicResult, quoteResult] = await Promise.all([
        Services.getTopicAnalyzer().analyze(messagesToAnalyze),
        Services.getGoldenQuoteAnalyzer().analyze(messagesToAnalyze)
      ])

      // 缓存结果到Redis（使用批次索引作为key）
      const cacheKey = `Yz:groupManager:batch:${groupId}:${date}:${batchIndex}`
      const cacheData = {
        batchIndex,
        startIndex,
        endIndex,
        messageCount: messagesToAnalyze.length,
        topics: topicResult?.topics || [],
        goldenQuotes: quoteResult?.goldenQuotes || [],
        analyzedAt: Date.now(),
        success: true
      }

      await redis.set(cacheKey, JSON.stringify(cacheData), 'EX', 86400) // 24小时过期

      logger.info(`[群聊洞见] 批次${batchIndex}分析完成并缓存 [${startIndex}-${endIndex}]，话题: ${cacheData.topics.length}, 金句: ${cacheData.goldenQuotes.length}`)
    } catch (err) {
      logger.error(`[群聊洞见] 批次${batchIndex}触发分析失败: ${err.stack || err}`)

      // 即使失败也记录一个标记，避免重复尝试
      try {
        const cacheKey = `Yz:groupManager:batch:${groupId}:${date}:${batchIndex}`
        await redis.set(cacheKey, JSON.stringify({
          batchIndex,
          success: false,
          error: err.message,
          analyzedAt: Date.now()
        }), 'EX', 86400)
      } catch (cacheErr) {
        logger.error(`[群聊洞见] 保存失败标记失败: ${cacheErr}`)
      }
    }
  }
}
