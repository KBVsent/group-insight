/**
 * 消息收集器
 * 监听群消息并保存到 Redis
 * 同时处理艾特记录
 */

import moment from 'moment'
import RedisHelper from '../utils/redisHelper.js'

export default class MessageCollector {
  constructor(config) {
    this.config = config || {}
    this.redisHelper = new RedisHelper(
      config.retentionDays || 7,
      config.atRetentionHours || 24
    )
    this.maxMessageLength = config.maxMessageLength || 500
    this.collectImages = config.collectImages !== undefined ? config.collectImages : false
    this.collectFaces = config.collectFaces !== undefined ? config.collectFaces : false
  }

  /**
   * 开始监听群消息
   */
  startCollecting() {
    Bot.on('message.group', async (e) => {
      try {
        await this.handleMessage(e)
      } catch (err) {
        logger.error(`[群聊管理] 消息收集失败: ${err}`)
      }
    })

    logger.info('[群聊管理] 消息收集器已启动')
  }

  /**
   * 处理群消息
   * @param {object} e - 事件对象
   */
  async handleMessage(e) {
    // 提取消息内容
    const message = this.extractMessage(e)

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
    const faces = []

    // 遍历消息段
    for (const msg of e.message) {
      if (msg.type === 'text') {
        text += msg.text
      } else if (msg.type === 'at') {
        atUsers.push(msg.qq)
      } else if (msg.type === 'image' && this.collectImages) {
        // 图片可能有不同的字段：url, file
        const imgUrl = msg.url || msg.file
        if (imgUrl) {
          images.push(imgUrl)
          logger.debug(`[群聊管理] 收集图片: ${imgUrl}`)
        }
      } else if (msg.type === 'face' && this.collectFaces) {
        faces.push(msg.id)
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
      atAll: e.atall || false
    }
  }

  /**
   * 保存消息到 Redis
   * @param {object} e - 事件对象
   * @param {object} message - 消息数据
   */
  async saveMessage(e, message) {
    const messageData = {
      user_id: e.user_id,
      nickname: e.sender.nickname || e.nickname,
      message: message.text,
      time: e.time,
      timestamp: Date.now()
    }

    if (message.images.length > 0) {
      messageData.images = message.images
    }

    if (message.faces.length > 0) {
      messageData.faces = message.faces
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
        logger.debug(`[群聊管理] 获取回复消息失败: ${err}`)
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

      logger.debug(`[群聊管理] 保存艾特记录 - 文本: "${message.text}", 图片数: ${message.images.length}, 表情数: ${message.faces.length}`)
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
}
