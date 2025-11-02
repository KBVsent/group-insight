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
    const msgConfig = config.messageCollection || {}
    this.redisHelper = new RedisHelper(
      config.retentionDays || 7,
      config.atRetentionHours || 24
    )
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
      face: [],      // 普通表情
      mface: [],     // 动画表情
      bface: [],     // 超级表情
      sface: [],     // 小表情
      animated: 0    // 动图数量 (通过 summary 字段检测)
    }
    let hasReply = false

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
          logger.debug(`[群聊助手] 收集图片: ${imgUrl}`)
        }
      } else if (this.collectFaces) {
        // 收集各种类型的表情
        if (msg.type === 'face') {
          faces.face.push(msg.id)
        } else if (msg.type === 'mface') {
          faces.mface.push(msg.id)
          // 检测是否是动画表情
          if (msg.summary && msg.summary.includes('动画')) {
            faces.animated++
          }
        } else if (msg.type === 'bface') {
          faces.bface.push(msg.id)
        } else if (msg.type === 'sface') {
          faces.sface.push(msg.id)
        }
      } else if (msg.type === 'reply') {
        hasReply = true
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

    // 计算总表情数
    const totalFaces = message.faces.face.length +
                       message.faces.mface.length +
                       message.faces.bface.length +
                       message.faces.sface.length

    if (totalFaces > 0 || message.faces.animated > 0) {
      messageData.faces = {
        face: message.faces.face,
        mface: message.faces.mface,
        bface: message.faces.bface,
        sface: message.faces.sface,
        animated: message.faces.animated,
        total: totalFaces + message.faces.animated
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

      const facesCount = message.faces.face.length +
                        message.faces.mface.length +
                        message.faces.bface.length +
                        message.faces.sface.length +
                        message.faces.animated
      logger.debug(`[群聊助手] 保存艾特记录 - 文本: "${message.text}", 图片数: ${message.images.length}, 表情数: ${facesCount}`)
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
}
