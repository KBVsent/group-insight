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
}
