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
import puppeteer from '../../lib/puppeteer/puppeteer.js'
import chokidar from 'chokidar'

// 服务
import MessageCollector from './services/messageCollector.js'
import WordCloudGenerator from './services/wordCloudGenerator.js'
import AIService from './services/aiService.js'
import StatisticsService from './services/StatisticsService.js'
import ActivityVisualizer from './services/ActivityVisualizer.js'

// 分析器
import TopicAnalyzer from './services/analyzers/TopicAnalyzer.js'
import GoldenQuoteAnalyzer from './services/analyzers/GoldenQuoteAnalyzer.js'
import UserTitleAnalyzer from './services/analyzers/UserTitleAnalyzer.js'

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
    logger.warn('[群聊助手] 默认配置文件不存在')
    return config
  }

  // 合并用户配置
  if (fs.existsSync(userConfigPath)) {
    const yaml = await import('yaml')
    const userConfig = fs.readFileSync(userConfigPath, 'utf8')
    const userSettings = yaml.parse(userConfig).groupManager || {}
    config = { ...config, ...userSettings }
    logger.info('[群聊助手] 已加载用户配置')
  } else {
    logger.info('[群聊助手] 未找到用户配置，使用默认配置（可复制 config/config.example.yaml 为 config/config.yaml 进行自定义配置）')
  }

  return config
}

// 全局配置和服务实例
let globalConfig = null
let messageCollector = null
let wordCloudGenerator = null
let aiService = null
let statisticsService = null
let activityVisualizer = null
let topicAnalyzer = null
let goldenQuoteAnalyzer = null
let userTitleAnalyzer = null
let configWatcher = null  // 配置文件监听器（单例）

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
          reg: '^#(群聊)?词云\\s*(当天|三天|七天)?$',
          fnc: 'generateWordCloud',
          permission: 'all'
        },
        {
          reg: '^#群聊报告\\s*(今天|昨天|前天|\\d{4}-\\d{2}-\\d{2})?$',
          fnc: 'generateReport',
          permission: 'all'
        },
        {
          reg: '^#强制群聊报告$',
          fnc: 'forceGenerateReport',
          permission: 'master'
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

    // 在 super() 之后设置定时任务
    this.task = {
      name: '每小时群聊报告',
      cron: '0 * * * *',  // 每小时整点执行
      fnc: () => this.scheduledReport(),  // 使用箭头函数
      log: true
    }
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

    // 初始化统计服务
    const statsConfig = {
      night_start_hour: globalConfig.statistics?.night_start_hour || 0,
      night_end_hour: globalConfig.statistics?.night_end_hour || 6
    }
    statisticsService = new StatisticsService(statsConfig)

    // 初始化活跃度可视化
    activityVisualizer = new ActivityVisualizer(globalConfig.analysis?.activity || {})

    // 初始化分析器
    const analysisConfig = {
      llm_timeout: globalConfig.ai?.llm_timeout || 100,
      llm_retries: globalConfig.ai?.llm_retries || 2,
      llm_backoff: globalConfig.ai?.llm_backoff || 2,
      ...globalConfig.analysis?.topic,
      ...globalConfig.analysis?.goldenQuote,
      ...globalConfig.analysis?.userTitle,
      min_messages_threshold: globalConfig.analysis?.min_messages_threshold || 20
    }

    topicAnalyzer = new TopicAnalyzer(aiService, analysisConfig)
    goldenQuoteAnalyzer = new GoldenQuoteAnalyzer(aiService, analysisConfig)
    userTitleAnalyzer = new UserTitleAnalyzer(aiService, analysisConfig)

    // 显示功能状态
    const enabledFeatures = []
    if (globalConfig.analysis?.topic?.enabled !== false) enabledFeatures.push('话题分析')
    if (globalConfig.analysis?.goldenQuote?.enabled !== false) enabledFeatures.push('金句提取')
    if (globalConfig.analysis?.userTitle?.enabled !== false) enabledFeatures.push('用户称号')
    if (globalConfig.analysis?.activity?.enabled !== false) enabledFeatures.push('活跃度图表')

    if (enabledFeatures.length > 0) {
      logger.info(`[群聊助手] 增强分析功能已启用: ${enabledFeatures.join('、')}`)
    }

    // 显示定时总结状态
    const scheduleEnabled = globalConfig.schedule?.enabled !== false
    const whitelist = globalConfig.schedule?.whitelist || []
    if (scheduleEnabled && whitelist.length > 0) {
      logger.info(`[群聊助手] 定时总结已启用，白名单群数: ${whitelist.length}`)
    } else {
      logger.info('[群聊助手] 定时总结未启用（需配置白名单群）')
    }

    // 监听配置文件变化（热重载）
    this.watchConfig()

    logger.info('[群聊助手] 插件初始化完成')
  }

  /**
   * 监听配置文件变化
   */
  watchConfig() {
    // 如果已经有监听器，直接返回（避免重复注册）
    if (configWatcher) {
      logger.debug('[群聊助手] 配置文件监听器已存在，跳过注册')
      return
    }

    const configPath = join(__dirname, 'config/config.yaml')

    // 只监听用户配置文件（不监听默认配置文件）
    if (fs.existsSync(configPath)) {
      configWatcher = chokidar.watch(configPath, {
        persistent: true,
        ignoreInitial: true
      })

      configWatcher.on('change', async () => {
        logger.mark('[群聊助手] 检测到配置文件修改，正在重新加载...')

        try {
          // 重新加载配置
          globalConfig = await loadConfig()

          // 停止旧的消息收集器
          if (messageCollector) {
            messageCollector.stopCollecting()
          }

          // 重新初始化服务
          if (globalConfig.messageCollection?.enabled !== false) {
            messageCollector = new MessageCollector(globalConfig)
            messageCollector.startCollecting()
          } else {
            messageCollector = null
          }

          // 重新初始化词云生成器
          wordCloudGenerator = new WordCloudGenerator(globalConfig.wordCloud || {})

          // 重新初始化 AI 服务
          aiService = new AIService(globalConfig.ai || {})

          // 重新初始化统计和分析服务
          const statsConfig = {
            night_start_hour: globalConfig.statistics?.night_start_hour || 0,
            night_end_hour: globalConfig.statistics?.night_end_hour || 6
          }
          statisticsService = new StatisticsService(statsConfig)
          activityVisualizer = new ActivityVisualizer(globalConfig.analysis?.activity || {})

          const analysisConfig = {
            llm_timeout: globalConfig.ai?.llm_timeout || 100,
            llm_retries: globalConfig.ai?.llm_retries || 2,
            llm_backoff: globalConfig.ai?.llm_backoff || 2,
            ...globalConfig.analysis?.topic,
            ...globalConfig.analysis?.goldenQuote,
            ...globalConfig.analysis?.userTitle,
            min_messages_threshold: globalConfig.analysis?.min_messages_threshold || 20
          }

          topicAnalyzer = new TopicAnalyzer(aiService, analysisConfig)
          goldenQuoteAnalyzer = new GoldenQuoteAnalyzer(aiService, analysisConfig)
          userTitleAnalyzer = new UserTitleAnalyzer(aiService, analysisConfig)

          logger.mark('[群聊助手] 配置文件重新加载完成')
        } catch (err) {
          logger.error(`[群聊助手] 配置文件重新加载失败: ${err}`)
        }
      })

      logger.info('[群聊助手] 配置文件热重载已启用')
    }
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
      // Bot.uin 是数组，取第一个或使用 e.self_id
      userId = Array.isArray(Bot.uin) ? Bot.uin[0] : (e.self_id || Bot.uin)
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

      // 添加普通表情（QQ 系统表情，不需要刷新 rkey）
      // 注意：segment.face 支持取决于协议适配器，部分适配器可能不支持
      if (record.faces && record.faces.face && record.faces.face.length > 0) {
        for (const faceId of record.faces.face) {
          try {
            msg.push(segment.face(faceId))
          } catch (err) {
            logger.debug(`[群聊助手] 发送表情失败 (face ${faceId}): ${err.message}`)
          }
        }
      }

      // 添加图片（刷新 rkey 以避免链接过期）
      if (record.images && record.images.length > 0) {
        logger.debug(`[群聊助手] 构建消息 - 图片数: ${record.images.length}`)

        // 批量刷新所有图片 URL
        const refreshedUrls = await rkeyManager.refreshBatch(record.images)

        for (const imgUrl of refreshedUrls) {
          logger.debug(`[群聊助手] 添加图片: ${imgUrl.substring(0, 100)}...`)
          msg.push(segment.image(imgUrl))
        }
      }

      // 添加动画表情（刷新 rkey 以避免链接过期）
      if (record.faces && record.faces.mface && record.faces.mface.length > 0) {
        logger.debug(`[群聊助手] 构建消息 - 动画表情数: ${record.faces.mface.length}`)

        // 批量刷新所有动画表情 URL
        const refreshedMfaces = await rkeyManager.refreshBatch(record.faces.mface)

        for (const mfaceUrl of refreshedMfaces) {
          logger.debug(`[群聊助手] 添加动画表情: ${mfaceUrl.substring(0, 100)}...`)
          msg.push(segment.image(mfaceUrl))
        }
      }

      logger.debug(`[群聊助手] 最终消息段数: ${msg.length}`)
      msgList.push({
        message: msg,
        user_id: record.user_id,
        nickname: record.nickname,
        time: record.time
      })
    }

    // 发送合并转发消息
    let forwardMsg
    try {
      // 优先使用 e.group.makeForwardMsg（推荐方式）
      if (e.group && e.group.makeForwardMsg) {
        forwardMsg = await e.group.makeForwardMsg(msgList)
      } else {
        // 降级方案：使用 Bot.makeForwardMsg
        forwardMsg = await Bot.makeForwardMsg(msgList)
      }

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
    } catch (err) {
      logger.error(`[群聊助手] 发送合并转发消息失败: ${err}`)
      await e.reply('发送消息失败，请查看日志', true)
      return false
    }
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
        logger.debug(`[群聊助手] 获取群名失败: ${err}，使用群号作为群名`)
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
      logger.error(`[群聊助手] 词云生成错误: ${err}`)
      await e.reply(`词云生成失败: ${err.message}`, true)
      return false
    }
  }

  /**
   * 定时任务：每小时生成群聊报告（带并发控制）
   */
  async scheduledReport() {
    if (!messageCollector) {
      logger.warn('[群聊助手] 定时报告功能未就绪')
      return
    }

    const scheduleConfig = globalConfig.schedule || {}
    const enabled = scheduleConfig.enabled !== false
    const whitelist = scheduleConfig.whitelist || []
    const minMessages = scheduleConfig.minMessages || 99  // 最小消息数阈值，默认99条
    const concurrency = scheduleConfig.concurrency || 3    // 并发数，默认3个

    // 检查是否启用
    if (!enabled || whitelist.length === 0) {
      logger.debug('[群聊助手] 定时报告未启用或白名单为空，跳过')
      return
    }

    logger.mark(`[群聊助手] 开始执行定时报告任务 (白名单群数: ${whitelist.length}, 并发数: ${concurrency})`)

    // 使用并发限制处理白名单群
    const results = await this.runWithConcurrency(
      whitelist,
      async (groupId) => {
        try {
          // 获取今天的消息
          const messages = await messageCollector.getMessages(groupId, 1)

          if (messages.length < minMessages) {
            logger.debug(`[群聊助手] 群 ${groupId} 今日消息数 (${messages.length}) 少于阈值 (${minMessages})，跳过报告`)
            return { groupId, status: 'skipped', reason: 'insufficient_messages' }
          }

          // 获取群名
          let groupName = `群${groupId}`
          try {
            const bot = Bot.bots?.[Bot.uin?.[0]] || Bot
            const group = bot.pickGroup?.(groupId)
            if (group) {
              const groupInfo = await group.getInfo?.()
              groupName = groupInfo?.group_name || groupInfo?.name || groupName
            }
          } catch (err) {
            logger.debug(`[群聊助手] 获取群 ${groupId} 名称失败，使用默认名称`)
          }

          // 执行分析
          logger.info(`[群聊助手] 正在为群 ${groupId} (${groupName}) 生成报告 (消息数: ${messages.length})`)
          const analysisResults = await this.performAnalysis(messages, 1)

          if (!analysisResults) {
            logger.warn(`[群聊助手] 群 ${groupId} 报告生成失败：分析失败`)
            return { groupId, status: 'failed', error: 'analysis_failed' }
          }

          // 保存报告到 Redis
          const today = moment().format('YYYY-MM-DD')
          await messageCollector.redisHelper.saveReport(groupId, today, {
            stats: analysisResults.stats,
            topics: analysisResults.topics,
            goldenQuotes: analysisResults.goldenQuotes,
            userTitles: analysisResults.userTitles,
            messageCount: messages.length,
            tokenUsage: analysisResults.tokenUsage
          })

          logger.mark(`[群聊助手] 群 ${groupId} 报告生成成功 (${messages.length} 条消息)`)
          return { groupId, status: 'success', messageCount: messages.length }
        } catch (err) {
          logger.error(`[群聊助手] 群 ${groupId} 定时报告异常: ${err}`)
          return { groupId, status: 'error', error: err.message }
        }
      },
      concurrency
    )

    // 统计结果
    const summary = {
      total: results.length,
      success: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      error: results.filter(r => r.status === 'error').length
    }

    logger.mark(`[群聊助手] 定时报告任务执行完成 - 总数: ${summary.total}, 成功: ${summary.success}, 失败: ${summary.failed}, 跳过: ${summary.skipped}, 异常: ${summary.error}`)
  }

  /**
   * 并发限制执行器
   * @param {Array} items - 待处理的项目数组
   * @param {Function} handler - 处理函数
   * @param {number} concurrency - 并发数
   * @returns {Promise<Array>} 处理结果数组
   */
  async runWithConcurrency(items, handler, concurrency = 3) {
    const results = []
    const executing = []

    for (const item of items) {
      const promise = Promise.resolve().then(() => handler(item))
      results.push(promise)

      if (concurrency <= items.length) {
        const e = promise.then(() => executing.splice(executing.indexOf(e), 1))
        executing.push(e)

        if (executing.length >= concurrency) {
          await Promise.race(executing)
        }
      }
    }

    return Promise.all(results)
  }



  /**
   * 查询群聊报告
   * 支持查询今天、昨天、前天或指定日期的报告
   */
  async generateReport(e) {
    if (!e.isGroup) {
      await e.reply('此功能仅支持群聊使用', true)
      return false
    }

    if (!messageCollector) {
      await e.reply('报告功能未就绪', true)
      return false
    }

    try {
      // 解析查询参数
      const match = e.msg.match(/(今天|昨天|前天|(\d{4}-\d{2}-\d{2}))/)
      let queryDate = moment().format('YYYY-MM-DD')  // 默认今天
      let dateLabel = '今天'

      if (match) {
        if (match[1] === '昨天') {
          queryDate = moment().subtract(1, 'days').format('YYYY-MM-DD')
          dateLabel = '昨天'
        } else if (match[1] === '前天') {
          queryDate = moment().subtract(2, 'days').format('YYYY-MM-DD')
          dateLabel = '前天'
        } else if (match[2]) {
          // 日期格式验证
          const date = moment(match[2], 'YYYY-MM-DD', true)
          if (date.isValid()) {
            queryDate = date.format('YYYY-MM-DD')
            dateLabel = moment(queryDate).format('YYYY年MM月DD日')
          } else {
            await e.reply('日期格式错误，请使用：YYYY-MM-DD（如 2024-11-01）', true)
            return false
          }
        } else if (match[1] === '今天') {
          dateLabel = '今天'
        }
      }

      // 从 Redis 获取指定日期的报告
      const report = await messageCollector.redisHelper.getReport(e.group_id, queryDate)

      if (!report) {
        await e.reply(`${dateLabel}还没有生成报告`, true)
        return false
      }

      logger.info(`[群聊助手] 用户 ${e.user_id} 查询群 ${e.group_id} 的${dateLabel}报告`)

      // 获取群名
      let groupName = '未知群聊'
      try {
        const groupInfo = await e.group.getInfo?.()
        groupName = groupInfo?.group_name || e.group?.name || e.group?.group_name || `群${e.group_id}`
      } catch (err) {
        groupName = `群${e.group_id}`
      }

      // 渲染报告
      const img = await this.renderReport(report, {
        groupName,
        provider: aiService?.provider || 'AI',
        model: aiService?.model || '',
        tokenUsage: report.tokenUsage,
        date: queryDate
      })

      if (img) {
        await e.reply(img)
      } else {
        // 渲染失败，发送文本总结
        let textSummary = `📊 ${dateLabel}群聊报告\n\n`
        textSummary += `消息总数: ${report.stats?.basic?.totalMessages || report.messageCount}\n`
        textSummary += `参与人数: ${report.stats?.basic?.totalUsers || 0}\n`
        textSummary += `日期: ${queryDate}\n\n`

        if (report.topics && report.topics.length > 0) {
          textSummary += `💬 热门话题:\n`
          report.topics.forEach((topic, i) => {
            textSummary += `${i + 1}. ${topic.topic}\n`
          })
          textSummary += `\n`
        }

        if (report.userTitles && report.userTitles.length > 0) {
          textSummary += `🏆 群友称号:\n`
          report.userTitles.forEach((title) => {
            textSummary += `• ${title.user} - ${title.title} (${title.mbti})\n`
          })
          textSummary += `\n`
        }

        if (report.goldenQuotes && report.goldenQuotes.length > 0) {
          textSummary += `💎 群圣经:\n`
          report.goldenQuotes.forEach((quote, i) => {
            textSummary += `${i + 1}. "${quote.quote}" —— ${quote.sender}\n`
          })
        }

        await e.reply(textSummary, true)
      }

      return true
    } catch (err) {
      logger.error(`[群聊助手] 查询报告错误: ${err}`)
      await e.reply(`查询报告失败: ${err.message}`, true)
      return false
    }
  }

  /**
   * 强制生成群聊报告（主人专用）
   * 立即生成今天的报告，覆盖已有报告
   */
  async forceGenerateReport(e) {
    if (!e.isGroup) {
      await e.reply('此功能仅支持群聊使用', true)
      return false
    }

    if (!messageCollector) {
      await e.reply('报告功能未就绪', true)
      return false
    }

    await e.reply('正在强制生成今天的群聊报告，请稍候...')

    try {
      // 获取今天的消息
      const messages = await messageCollector.getMessages(e.group_id, 1)

      if (messages.length === 0) {
        await e.reply('今天还没有消息，无法生成报告', true)
        return false
      }

      // 获取群名
      let groupName = '未知群聊'
      try {
        const groupInfo = await e.group.getInfo?.()
        groupName = groupInfo?.group_name || e.group?.name || e.group?.group_name || `群${e.group_id}`
      } catch (err) {
        groupName = `群${e.group_id}`
      }

      logger.info(`[群聊助手] 主人 ${e.user_id} 强制生成群 ${e.group_id} (${groupName}) 的报告 (消息数: ${messages.length})`)

      // 执行分析
      const analysisResults = await this.performAnalysis(messages, 1)

      if (!analysisResults) {
        await e.reply('分析失败，请查看日志', true)
        return false
      }

      // 保存报告到 Redis（覆盖已有报告）
      const today = moment().format('YYYY-MM-DD')
      await messageCollector.redisHelper.saveReport(e.group_id, today, {
        stats: analysisResults.stats,
        topics: analysisResults.topics,
        goldenQuotes: analysisResults.goldenQuotes,
        userTitles: analysisResults.userTitles,
        messageCount: messages.length,
        tokenUsage: analysisResults.tokenUsage
      })

      logger.mark(`[群聊助手] 主人强制生成报告成功 - 群 ${e.group_id}, 消息数: ${messages.length}`)

      // 渲染并发送报告
      const img = await this.renderReport(analysisResults, {
        groupName,
        provider: aiService?.provider || 'AI',
        model: aiService?.model || '',
        tokenUsage: analysisResults.tokenUsage,
        date: today
      })

      if (img) {
        await e.reply(img)
      } else {
        await e.reply('报告已生成并保存，但渲染失败', true)
      }

      return true
    } catch (err) {
      logger.error(`[群聊助手] 强制生成报告错误: ${err}`)
      await e.reply(`生成报告失败: ${err.message}`, true)
      return false
    }
  }

  /**
   * 执行分析
   * @param {Array} messages - 消息列表
   * @param {number} days - 天数
   * @returns {Object} 分析结果
   */
  async performAnalysis(messages, days = 1) {
    try {
      logger.info(`[群聊助手] 开始增强分析 (消息数: ${messages.length})`)

      // 1. 基础统计分析
      const stats = statisticsService.analyze(messages)
      logger.info(`[群聊助手] 基础统计完成 - 参与用户: ${stats.basic.totalUsers}`)

      // 检查是否满足最小消息数阈值
      const minThreshold = globalConfig.analysis?.min_messages_threshold || 20
      if (messages.length < minThreshold) {
        logger.warn(`[群聊助手] 消息数 (${messages.length}) 少于阈值 (${minThreshold}), 跳过 AI 分析`)
        return {
          stats,
          topics: [],
          goldenQuotes: [],
          userTitles: [],
          skipped: true,
          reason: `消息数不足 (需要至少 ${minThreshold} 条)`
        }
      }

      // 2. 并行执行三个 AI 分析
      const analysisPromises = []

      // 话题分析
      if (globalConfig.analysis?.topic?.enabled !== false) {
        analysisPromises.push(
          topicAnalyzer.analyze(messages, stats)
            .then(result => ({ type: 'topics', data: result.topics, usage: result.usage }))
            .catch(err => {
              logger.error(`[群聊助手] 话题分析失败: ${err}`)
              return { type: 'topics', data: [], usage: null }
            })
        )
      }

      // 金句提取
      if (globalConfig.analysis?.goldenQuote?.enabled !== false) {
        analysisPromises.push(
          goldenQuoteAnalyzer.analyze(messages, stats)
            .then(result => ({ type: 'goldenQuotes', data: result.goldenQuotes, usage: result.usage }))
            .catch(err => {
              logger.error(`[群聊助手] 金句提取失败: ${err}`)
              return { type: 'goldenQuotes', data: [], usage: null }
            })
        )
      }

      // 用户称号
      if (globalConfig.analysis?.userTitle?.enabled !== false) {
        analysisPromises.push(
          userTitleAnalyzer.analyze(messages, stats)
            .then(result => ({ type: 'userTitles', data: result.userTitles, usage: result.usage }))
            .catch(err => {
              logger.error(`[群聊助手] 用户称号分析失败: ${err}`)
              return { type: 'userTitles', data: [], usage: null }
            })
        )
      }

      // 等待所有分析完成
      const results = await Promise.all(analysisPromises)

      // 整合结果
      const analysisResults = {
        stats,
        topics: [],
        goldenQuotes: [],
        userTitles: [],
        skipped: false,
        tokenUsage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      }

      for (const result of results) {
        analysisResults[result.type] = result.data

        // 累加 token 使用情况
        if (result.usage) {
          analysisResults.tokenUsage.prompt_tokens += result.usage.prompt_tokens || 0
          analysisResults.tokenUsage.completion_tokens += result.usage.completion_tokens || 0
          analysisResults.tokenUsage.total_tokens += result.usage.total_tokens || 0
        }
      }

      logger.info(`[群聊助手] 增强分析完成 - 话题: ${analysisResults.topics.length}, 金句: ${analysisResults.goldenQuotes.length}, 称号: ${analysisResults.userTitles.length}, Tokens: ${analysisResults.tokenUsage.total_tokens}`)

      return analysisResults
    } catch (err) {
      logger.error(`[群聊助手] 增强分析失败: ${err}`)
      return null
    }
  }

  /**
   * 渲染报告
   * @param {Object} analysisResults - 分析结果
   * @param {Object} options - 渲染选项
   * @returns {Buffer} 图片 Buffer
   */
  async renderReport(analysisResults, options) {
    try {
      const { stats, topics, goldenQuotes, userTitles } = analysisResults

      // 生成活跃度图表 HTML
      const activityChart = globalConfig.analysis?.activity?.enabled !== false
        ? activityVisualizer.generateChart(stats.hourly)
        : ''

      // 格式化日期范围
      const dateRange = stats.basic.dateRange.start === stats.basic.dateRange.end
        ? stats.basic.dateRange.start
        : `${stats.basic.dateRange.start} ~ ${stats.basic.dateRange.end}`

      // 获取渲染质量配置
      const renderConfig = globalConfig.summary?.render || {}
      const imgType = renderConfig.imgType || 'png'
      const quality = renderConfig.quality || 100

      // 格式化 token 使用情况
      const tokenUsage = options.tokenUsage ? {
        prompt: options.tokenUsage.prompt_tokens || 0,
        completion: options.tokenUsage.completion_tokens || 0,
        total: options.tokenUsage.total_tokens || 0
      } : null

      const templateData = {
        provider: options.provider === 'claude' ? 'Claude' : options.provider === 'openai' ? 'OpenAI' : options.provider || 'AI',
        model: options.model || '',
        groupName: options.groupName || '未知群聊',

        // 基础统计
        totalMessages: stats.basic.totalMessages,
        totalUsers: stats.basic.totalUsers,
        totalChars: stats.basic.totalChars,
        totalEmojis: stats.basic.totalEmojis,
        avgLength: stats.basic.avgCharsPerMsg,
        dateRange,
        peakPeriod: stats.hourly.peakPeriod,

        // 活跃度图表
        enableActivityChart: globalConfig.analysis?.activity?.enabled !== false,
        activityChart,

        // AI 分析结果
        topics,
        goldenQuotes,
        userTitles,

        // 传统总结 (如果有)
        summaryHtml: options.summaryHtml || '',

        // 元数据
        createTime: moment().format('YYYY-MM-DD HH:mm:ss'),
        tokenUsage,

        pluResPath: join(__dirname, 'resources') + '/'
      }

      // 使用增强模板渲染
      const img = await puppeteer.screenshot('group-insight-enhanced', {
        tplFile: join(__dirname, 'resources/summary/enhanced.html'),
        imgType,
        quality,
        ...templateData
      })

      return img
    } catch (err) {
      logger.error(`[群聊助手] 渲染增强总结失败: ${err}`)
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
