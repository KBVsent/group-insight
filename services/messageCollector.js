/**
 * 消息收集器
 * 监听群消息并保存到 Redis
 * 同时处理艾特记录
 */

import RedisHelper from '../utils/redisHelper.js'
import ImageRkeyManager from '../utils/imageRkeyManager.js'

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

    // 定时总结白名单配置
    this.scheduleConfig = config.schedule || {}
    this.whitelist = this.scheduleConfig.whitelist || []

    logger.info(`[群聊助手] 消息收集配置 - 收集图片: ${this.collectImages}, 收集表情: ${this.collectFaces}`)
    if (this.whitelist.length > 0) {
      logger.info(`[群聊助手] 定时总结白名单: ${this.whitelist.length} 个群`)
    }
  }

  /**
   * 开始监听群消息
   */
  startCollecting() {
    Bot.on('message.group', async (e) => {
      try {
        await this.handleMessage(e)
      } catch (err) {
        logger.error(`[群聊助手] 消息收集失败: ${err}`)
      }
    })

    logger.info('[群聊助手] 消息收集器已启动')
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
        logger.error(`[群聊助手] 更新 rkey 失败: ${err}`)
      })
    }

    // 保存消息
    if (message.text) {
      await this.saveMessage(e, message)
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
            logger.debug(`[群聊助手] 检测到 ${emojiCount} 个 Emoji 表情`)
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
            logger.debug(`[群聊助手] 收集动画表情: ${msg.summary}, URL: ${mfaceUrl.substring(0, 100)}`)
          }
        } else if (this.collectImages) {
          // 普通图片
          const imgUrl = msg.url || msg.file
          if (imgUrl) {
            images.push(imgUrl)
            logger.debug(`[群聊助手] 收集图片: ${imgUrl.substring(0, 100)}`)
          }
        }
      } else if (msg.type === 'reply') {
        hasReply = true
      }

      // 尝试从 raw 字段解析 CQ 码中的 face
      if (this.collectFaces && msg.raw && typeof msg.raw === 'string') {
        const faceMatch = msg.raw.match(/\[CQ:face,id=(\d+)/i)
        if (faceMatch) {
          faces.face.push(faceMatch[1])
          faces.total++
          logger.debug(`[群聊助手] 从 raw 解析到普通表情: face ${faceMatch[1]}`)
        }
      }

      // 调试：打印所有消息段结构（仅在 DEBUG 模式）
      if (this.collectFaces && process.env.DEBUG_MESSAGE_COLLECTOR) {
        logger.debug(`[群聊助手] 消息段: type=${msg.type}, raw=${msg.raw}, summary=${msg.summary}, keys=${Object.keys(msg).join(',')}`)
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

    const messageData = {
      user_id: e.user_id,
      nickname: e.sender.nickname || e.nickname,
      message: message.text,
      time: e.time,
      timestamp: Date.now(),
      hour,  // 消息小时 (0-23)
      length: message.text.length,  // 消息长度
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
        logger.debug(`[群聊助手] 获取回复消息失败: ${err}`)
      }
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
        messageId: replyMessageId
      }

      logger.debug(`[群聊助手] 保存艾特记录 - 文本: "${message.text}", 图片数: ${message.images.length}, 表情数: ${message.faces.total}`)
      await this.redisHelper.saveAtRecord(e.group_id, userId.toString(), atData)
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
   * 获取 rkey 管理器实例
   * @returns {ImageRkeyManager} rkey 管理器
   */
  getRkeyManager() {
    return this.rkeyManager
  }
}
