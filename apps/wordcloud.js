/**
 * 词云生成功能
 */
import plugin from '../../../lib/plugins/plugin.js'
import { getMessageCollector, getWordCloudGenerator } from '../components/index.js'

export class WordCloudPlugin extends plugin {
  constructor() {
    super({
      name: '群聊洞见',
      dsc: '生成群聊词云图',
      event: 'message.group',
      priority: 5000,
      rule: [
        {
          reg: '^#(群聊)?词云\\s*(当天|三天|七天)?$',
          fnc: 'generateWordCloud',
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
    await Promise.all([
      getMessageCollector(),
      getWordCloudGenerator()
    ])
  }

  /**
   * 生成词云
   */
  async generateWordCloud(e) {
    const [messageCollector, wordCloudGenerator] = await Promise.all([
      getMessageCollector(),
      getWordCloudGenerator()
    ])

    if (!messageCollector || !wordCloudGenerator) {
      return this.reply('词云功能未就绪', true)
    }

    // 解析天数
    const match = e.msg.match(/(当天|三天|七天)/)
    let days = 1
    if (match) {
      if (match[1] === '三天') days = 3
      else if (match[1] === '七天') days = 7
    }

    await this.reply(`正在生成${days === 1 ? '当天' : days === 3 ? '三天' : '七天'}的词云，请稍候...`)

    try {
      // 获取消息
      const messages = await messageCollector.getMessages(e.group_id, days)

      if (messages.length === 0) {
        return this.reply(`没有找到最近${days}天的消息记录`, true)
      }

      // 获取群名
      let groupName = '未知群聊'
      try {
        const groupInfo = await e.group.getInfo?.()
        groupName = groupInfo?.group_name || e.group?.name || e.group?.group_name || `群${e.group_id}`
      } catch (err) {
        logger.debug(`[群聊洞见] 获取群名失败: ${err}，使用群号作为群名`)
        groupName = `群${e.group_id}`
      }

      // 生成词云
      const img = await wordCloudGenerator.generate(messages, {
        groupId: e.group_id,
        groupName,
        days
      })

      if (!img) {
        return this.reply('词云生成失败，请查看日志', true)
      }

      return this.reply(img)
    } catch (err) {
      logger.error(`[群聊洞见] 词云生成错误: ${err}`)
      return this.reply(`词云生成失败: ${err.message}`, true)
    }
  }
}
