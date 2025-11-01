/**
 * 群聊信息管理插件
 * 功能：谁艾特我、词云生成、AI总结
 * 作者：vsentkb
 * 版本：1.0.0
 */

import plugin from '../../lib/plugins/plugin.js'
import moment from 'moment'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'
import { marked } from 'marked'
import puppeteer from '../../lib/puppeteer/puppeteer.js'

// 服务
import MessageCollector from './services/messageCollector.js'
import WordCloudGenerator from './services/wordCloudGenerator.js'
import AIService from './services/aiService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 加载配置
async function loadConfig() {
  const defaultConfigPath = join(__dirname, 'config/default_config.yaml')
  const userConfigPath = join(__dirname, 'config/config.yaml')

  let config = {}

  // 读取默认配置
  if (fs.existsSync(defaultConfigPath)) {
    const yaml = await import('yaml')
    const defaultConfig = fs.readFileSync(defaultConfigPath, 'utf8')
    config = yaml.parse(defaultConfig).groupManager || {}
  } else {
    logger.warn('[群聊管理] 默认配置文件不存在')
    return config
  }

  // 合并用户配置
  if (fs.existsSync(userConfigPath)) {
    const yaml = await import('yaml')
    const userConfig = fs.readFileSync(userConfigPath, 'utf8')
    const userSettings = yaml.parse(userConfig).groupManager || {}
    config = { ...config, ...userSettings }
    logger.info('[群聊管理] 已加载用户配置')
  } else {
    logger.info('[群聊管理] 未找到用户配置，使用默认配置（可复制 config/config.example.yaml 为 config/config.yaml 进行自定义配置）')
  }

  return config
}

// 全局配置和服务实例
let globalConfig = null
let messageCollector = null
let wordCloudGenerator = null
let aiService = null

export class GroupManager extends plugin {
  constructor() {
    super({
      name: '群聊信息管理',
      dsc: '群聊管理插件：谁艾特我、词云生成、AI总结',
      event: 'message',
      priority: 5000,
      rule: [
        {
          reg: '^(谁|哪个.*)(艾特|@|at)(我|他|她|它)$',
          fnc: 'whoAtMe',
          permission: 'all'
        },
        {
          reg: '^#?(群聊)?词云\\s*(当天|三天|七天)?$',
          fnc: 'generateWordCloud',
          permission: 'all'
        },
        {
          reg: '^#?(群聊)?总结\\s*(当天|三天|七天)?$',
          fnc: 'generateSummary',
          permission: 'all'
        },
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
   * 初始化插件
   */
  async init() {
    // 加载配置
    globalConfig = await loadConfig()

    // 初始化消息收集器
    if (globalConfig.messageCollection?.enabled !== false) {
      messageCollector = new MessageCollector(globalConfig)
      messageCollector.startCollecting()
    }

    // 初始化词云生成器
    wordCloudGenerator = new WordCloudGenerator(globalConfig.wordCloud || {})

    // 初始化 AI 服务
    aiService = new AIService(globalConfig.ai || {})

    logger.info('[群聊管理] 插件初始化完成')
  }

  /**
   * 谁艾特我功能
   */
  async whoAtMe(e) {
    if (!e.isGroup) {
      await e.reply('此功能仅支持群聊使用', true)
      return false
    }

    if (!messageCollector) {
      await e.reply('消息收集功能未启用', true)
      return false
    }

    // 确定查询的用户
    let userId = e.user_id
    if (e.atBot) {
      userId = Bot.uin
    } else if (e.at) {
      userId = e.at
    }

    // 获取艾特记录
    const records = await messageCollector.getAtRecords(e.group_id, userId.toString())

    if (!records || records.length === 0) {
      await e.reply('目前还没有人艾特过', true)
      return false
    }

    // 构建合并转发消息
    const msgList = []

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

      // 添加表情
      if (record.faces && record.faces.length > 0) {
        for (const faceId of record.faces) {
          msg.push(segment.face(faceId))
        }
      }

      // 添加图片
      if (record.images && record.images.length > 0) {
        logger.debug(`[群聊管理] 构建消息 - 图片数: ${record.images.length}`)
        for (const imgUrl of record.images) {
          logger.debug(`[群聊管理] 添加图片: ${imgUrl}`)
          msg.push(segment.image(imgUrl))
        }
      }

      logger.debug(`[群聊管理] 最终消息段数: ${msg.length}`)
      msgList.push({
        message: msg,
        user_id: record.user_id,
        nickname: record.nickname,
        time: record.time
      })
    }

    // 发送合并转发消息
    const forwardMsg = await e.group.makeForwardMsg(msgList)

    // 处理合并转发的标题
    if (typeof forwardMsg.data === 'object') {
      // 对象格式：直接修改属性（推荐方式）
      const detail = forwardMsg.data?.meta?.detail
      if (detail) {
        detail.news = [{ text: '点击查看谁艾特了你' }]
      }
    } else if (typeof forwardMsg.data === 'string') {
      // 字符串格式（XML）：一次性替换标题
      forwardMsg.data = forwardMsg.data.replace(
        /<title color="#777777" size="26">.*?<\/title>/,
        '<title color="#777777" size="26">点击查看谁艾特了你</title>'
      )
    }

    await e.reply(forwardMsg)
    return true
  }

  /**
   * 生成词云
   */
  async generateWordCloud(e) {
    if (!e.isGroup) {
      await e.reply('此功能仅支持群聊使用', true)
      return false
    }

    if (!messageCollector || !wordCloudGenerator) {
      await e.reply('词云功能未就绪', true)
      return false
    }

    // 解析天数
    const match = e.msg.match(/(当天|三天|七天)/)
    let days = 1
    if (match) {
      if (match[1] === '三天') days = 3
      else if (match[1] === '七天') days = 7
    }

    await e.reply(`正在生成${days === 1 ? '当天' : days === 3 ? '三天' : '七天'}的词云，请稍候...`)

    try {
      // 获取消息
      const messages = await messageCollector.getMessages(e.group_id, days)

      if (messages.length === 0) {
        await e.reply(`没有找到最近${days}天的消息记录`, true)
        return false
      }

      // 获取群名
      let groupName = '未知群聊'
      try {
        const groupInfo = await e.group.getInfo?.()
        groupName = groupInfo?.group_name || e.group?.name || e.group?.group_name || `群${e.group_id}`
      } catch (err) {
        logger.debug(`[群聊管理] 获取群名失败: ${err}，使用群号作为群名`)
        groupName = `群${e.group_id}`
      }

      // 生成词云
      const img = await wordCloudGenerator.generate(messages, {
        groupId: e.group_id,
        groupName,
        days
      })

      if (!img) {
        await e.reply('词云生成失败，请查看日志', true)
        return false
      }

      await e.reply(img)
      return true
    } catch (err) {
      logger.error(`[群聊管理] 词云生成错误: ${err}`)
      await e.reply(`词云生成失败: ${err.message}`, true)
      return false
    }
  }

  /**
   * AI 总结群聊
   */
  async generateSummary(e) {
    if (!e.isGroup) {
      await e.reply('此功能仅支持群聊使用', true)
      return false
    }

    if (!messageCollector || !aiService) {
      await e.reply('AI总结功能未就绪', true)
      return false
    }

    // 解析天数
    const match = e.msg.match(/(当天|三天|七天)/)
    let days = 1
    if (match) {
      if (match[1] === '三天') days = 3
      else if (match[1] === '七天') days = 7
    }

    await e.reply(`正在使用 AI 分析${days === 1 ? '当天' : days === 3 ? '三天' : '七天'}的群聊内容，请稍候...`)

    try {
      // 获取消息
      const messages = await messageCollector.getMessages(e.group_id, days)

      if (messages.length === 0) {
        await e.reply(`没有找到最近${days}天的消息记录`, true)
        return false
      }

      // 获取群名
      let groupName = '未知群聊'
      try {
        const groupInfo = await e.group.getInfo?.()
        groupName = groupInfo?.group_name || e.group?.name || e.group?.group_name || `群${e.group_id}`
      } catch (err) {
        logger.debug(`[群聊管理] 获取群名失败: ${err}，使用群号作为群名`)
        groupName = `群${e.group_id}`
      }

      // 调用 AI 总结
      const result = await aiService.summarize(messages, {
        groupName,
        days
      })

      if (!result.success) {
        await e.reply(`AI总结失败: ${result.error}`, true)
        return false
      }

      // 渲染总结结果
      const img = await this.renderSummary(result, {
        groupName,
        days,
        messageCount: messages.length
      })

      if (!img) {
        // 如果渲染失败，直接发送文本
        await e.reply(result.summary)
      } else {
        await e.reply(img)
      }

      return true
    } catch (err) {
      logger.error(`[群聊管理] AI总结错误: ${err}`)
      await e.reply(`AI总结失败: ${err.message}`, true)
      return false
    }
  }

  /**
   * 渲染总结结果
   */
  async renderSummary(result, options) {
    try {
      // 将 Markdown 转换为 HTML
      const summaryHtml = marked.parse(result.summary)

      const templateData = {
        provider: result.provider === 'claude' ? 'Claude' : result.provider === 'openai' ? 'OpenAI' : result.provider,
        groupName: options.groupName,
        timeRange: options.days === 1 ? '当天' : options.days === 3 ? '近三天' : '近七天',
        messageCount: options.messageCount,
        createTime: moment().format('YYYY-MM-DD HH:mm:ss'),
        summaryHtml,
        pluResPath: join(__dirname, 'resources') + '/'
      }

      const img = await puppeteer.screenshot('group-insight-summary', {
        tplFile: join(__dirname, 'resources/summary/index.html'),
        ...templateData
      })

      return img
    } catch (err) {
      logger.error(`[群聊管理] 渲染总结失败: ${err}`)
      return null
    }
  }

  /**
   * 清除艾特记录
   */
  async clearAtRecords(e) {
    if (!e.isGroup) {
      await e.reply('此功能仅支持群聊使用', true)
      return false
    }

    if (!messageCollector) {
      await e.reply('消息收集功能未启用', true)
      return false
    }

    const deleted = await messageCollector.clearAtRecords(e.group_id, e.user_id.toString())

    if (deleted > 0) {
      await e.reply('已成功清除你的艾特记录', true)
    } else {
      await e.reply('你目前没有艾特记录', true)
    }

    return true
  }

  /**
   * 清除所有艾特记录（仅主人）
   */
  async clearAllAtRecords(e) {
    if (!messageCollector) {
      await e.reply('消息收集功能未启用', true)
      return false
    }

    const count = await messageCollector.clearAllAtRecords()
    await e.reply(`已成功清除 ${count} 条艾特记录`)
    return true
  }
}

// 创建插件实例并初始化
const groupManager = new GroupManager()
await groupManager.init()

export { groupManager }
