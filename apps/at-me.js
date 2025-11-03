/**
 * 谁艾特我功能
 */
import plugin from '../../../lib/plugins/plugin.js'
import { segment } from 'icqq'
import { getMessageCollector } from '../components/index.js'

export class AtMePlugin extends plugin {
  constructor() {
    super({
      name: '群聊洞见',
      dsc: '查看谁艾特了你',
      event: 'message.group',
      priority: 5000,
      rule: [
        {
          reg: '^(谁|哪个.*)(艾特|@|at)(我|他|她|它)$',
          fnc: 'whoAtMe',
          permission: 'all'
        }
      ]
    })
  }

  /**
   * 初始化
   */
  async init() {
    // 初始化共享服务（由 Services 模块统一管理）
    getMessageCollector()
    logger.info('[群聊洞见-谁艾特我] 插件已初始化')
  }

  /**
   * 谁艾特我功能
   */
  async whoAtMe(e) {
    const messageCollector = getMessageCollector()
    if (!messageCollector) {
      return this.reply('消息收集功能未启用', true)
    }

    // 确定查询的用户
    let userId = e.user_id
    if (e.atBot) {
      userId = Array.isArray(Bot.uin) ? Bot.uin[0] : (e.self_id || Bot.uin)
    } else if (e.at) {
      userId = e.at
    }

    // 获取艾特记录
    const records = await messageCollector.getAtRecords(e.group_id, userId.toString())

    if (!records || records.length === 0) {
      return this.reply('目前还没有人艾特过', true)
    }

    // 构建合并转发消息
    const msgList = []
    const rkeyManager = messageCollector.getRkeyManager()

    for (const record of records) {
      const msg = []

      // 添加回复消息
      if (record.messageId) {
        msg.push({ type: 'reply', id: record.messageId })
      }

      // 添加文本
      if (record.message) {
        msg.push(record.message)
      }

      // 添加普通表情
      if (record.faces && record.faces.face && record.faces.face.length > 0) {
        for (const faceId of record.faces.face) {
          try {
            msg.push(segment.face(faceId))
          } catch (err) {
            logger.debug(`[群聊洞见] 发送表情失败 (face ${faceId}): ${err.message}`)
          }
        }
      }

      // 添加图片（刷新 rkey）
      if (record.images && record.images.length > 0) {
        const refreshedUrls = await rkeyManager.refreshBatch(record.images)
        for (const imgUrl of refreshedUrls) {
          msg.push(segment.image(imgUrl))
        }
      }

      // 添加动画表情（刷新 rkey）
      if (record.faces && record.faces.mface && record.faces.mface.length > 0) {
        const refreshedMfaces = await rkeyManager.refreshBatch(record.faces.mface)
        for (const mfaceUrl of refreshedMfaces) {
          msg.push(segment.image(mfaceUrl))
        }
      }

      msgList.push({
        message: msg,
        user_id: record.user_id,
        nickname: record.nickname,
        time: record.time
      })
    }

    // 发送合并转发消息
    try {
      let forwardMsg
      if (e.group && e.group.makeForwardMsg) {
        forwardMsg = await e.group.makeForwardMsg(msgList)
      } else {
        forwardMsg = await Bot.makeForwardMsg(msgList)
      }

      // 处理合并转发的标题
      if (typeof forwardMsg.data === 'object') {
        const detail = forwardMsg.data?.meta?.detail
        if (detail) {
          detail.news = [{ text: '点击查看谁艾特了你' }]
        }
      } else if (typeof forwardMsg.data === 'string') {
        forwardMsg.data = forwardMsg.data.replace(
          /<title color="#777777" size="26">.*?<\/title>/,
          '<title color="#777777" size="26">点击查看谁艾特了你</title>'
        )
      }

      return this.reply(forwardMsg)
    } catch (err) {
      logger.error(`[群聊洞见] 发送合并转发消息失败: ${err}`)
      return this.reply('发送消息失败，请查看日志', true)
    }
  }
}
