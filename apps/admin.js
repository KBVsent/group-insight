/**
 * 管理命令
 */
import plugin from '../../../lib/plugins/plugin.js'
import { Config, getMessageCollector, reinitializeServices } from '../components/index.js'

export class AdminPlugin extends plugin {
  constructor() {
    super({
      name: '群聊洞见',
      dsc: '管理命令',
      event: 'message',
      priority: 5000,
      rule: [
        {
          reg: '^#?清除(艾特|at)数据$',
          fnc: 'clearAtRecords',
          permission: 'all'
        },
        {
          reg: '^#?清除全部(艾特|at)数据$',
          fnc: 'clearAllAtRecords',
          permission: 'master'
        },
        {
          reg: '^#?强制生成批次(\\d+)?$',
          fnc: 'forceGenerateBatch',
          permission: 'master'
        }
      ]
    })
  }

  /**
   * 初始化
   */
  async init() {
    // 初始化共享服务
    getMessageCollector()

    // 监听配置变更并重新初始化服务
    Config.onChange(async (newConfig) => {
      await reinitializeServices(newConfig)
    })
  }

  /**
   * 清除艾特记录
   */
  async clearAtRecords(e) {
    if (!e.isGroup) {
      return this.reply('此功能仅支持群聊使用', true)
    }

    const messageCollector = getMessageCollector()
    if (!messageCollector) {
      return this.reply('消息收集功能未启用', true)
    }

    const deleted = await messageCollector.clearAtRecords(e.group_id, e.user_id.toString())

    if (deleted > 0) {
      return this.reply('已成功清除你的艾特记录', true)
    } else {
      return this.reply('你目前没有艾特记录', true)
    }
  }

  /**
   * 清除所有艾特记录（仅主人）
   */
  async clearAllAtRecords(e) {
    const messageCollector = getMessageCollector()
    if (!messageCollector) {
      return this.reply('消息收集功能未启用', true)
    }

    const count = await messageCollector.clearAllAtRecords()
    return this.reply(`已成功清除 ${count} 条艾特记录`)
  }

  /**
   * 强制生成批次（仅主人）
   * #强制生成批次 - 显示失败/缺失的批次
   * #强制生成批次0 - 强制重新生成批次0
   */
  async forceGenerateBatch(e) {
    // 检查是否在群聊中
    if (!e.isGroup) {
      return this.reply('此功能仅支持群聊使用', true)
    }

    // 获取消息收集器
    const messageCollector = getMessageCollector()
    if (!messageCollector) {
      return this.reply('消息收集功能未启用', true)
    }

    const moment = (await import('moment')).default
    const date = moment().format('YYYY-MM-DD')
    const config = Config.get()
    const maxMessages = config.ai?.maxMessages || 1000

    // 解析批次索引参数
    const match = e.msg.match(/强制生成批次(\d+)/)
    const batchIndex = match ? parseInt(match[1]) : null

    // 如果没有指定批次，显示当前群的批次状态
    if (batchIndex === null) {
      // 获取今天的消息数
      const messages = await messageCollector.getMessages(e.group_id, 1)
      const completedBatches = Math.floor(messages.length / maxMessages)

      if (completedBatches === 0) {
        return this.reply(`当前群今天消息数: ${messages.length}，还没有完整批次（需要${maxMessages}条）`, true)
      }

      // 检查每个批次的状态
      const successBatches = []
      const failedBatches = []
      const missingBatches = []

      for (let i = 0; i < completedBatches; i++) {
        const cacheKey = `Yz:groupManager:batch:${e.group_id}:${date}:${i}`
        const cachedData = await redis.get(cacheKey)

        if (cachedData) {
          try {
            const parsed = JSON.parse(cachedData)
            if (parsed.success) {
              successBatches.push(i)
            } else {
              failedBatches.push(i)
            }
          } catch (err) {
            failedBatches.push(i)
          }
        } else {
          missingBatches.push(i)
        }
      }

      const statusLines = [
        `今天消息数: ${messages.length}`,
        `完整批次数: ${completedBatches}`,
        ``,
        `✅ 成功批次: ${successBatches.length > 0 ? successBatches.join(', ') : '无'}`,
        `❌ 失败批次: ${failedBatches.length > 0 ? failedBatches.join(', ') : '无'}`,
        `⚪ 缺失批次: ${missingBatches.length > 0 ? missingBatches.join(', ') : '无'}`
      ]

      if (failedBatches.length > 0 || missingBatches.length > 0) {
        statusLines.push('')
        statusLines.push('使用 #强制生成批次N 手动生成指定批次')
        statusLines.push(`例如: #强制生成批次${failedBatches[0] ?? missingBatches[0]}`)
      }

      return this.reply(statusLines.join('\n'), true)
    }

    // 指定了批次索引，执行强制生成
    await this.reply(`开始强制生成批次${batchIndex}...`, true)

    try {
      await messageCollector.triggerPartialAnalysis(e.group_id, batchIndex, date)
      return this.reply(`批次${batchIndex}生成完成！\n使用 #群聊报告 查看最新报告`, true)
    } catch (err) {
      logger.error(`[群聊洞见] 强制生成批次${batchIndex}失败: ${err}`)
      return this.reply(`批次${batchIndex}生成失败: ${err.message}`, true)
    }
  }
}
