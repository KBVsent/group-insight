/**
 * 群聊报告功能
 */
import plugin from '../../../lib/plugins/plugin.js'
import moment from 'moment'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import {
  Config,
  getMessageCollector,
  getAIService,
  getStatisticsService,
  getActivityVisualizer,
  getTopicAnalyzer,
  getGoldenQuoteAnalyzer,
  getUserTitleAnalyzer,
  reinitializeServices
} from '../components/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const pluginRoot = join(__dirname, '..')

export class ReportPlugin extends plugin {
  constructor() {
    super({
      name: '群聊洞见',
      dsc: 'AI 增强分析报告',
      event: 'message.group',
      priority: 5000,
      rule: [
        {
          reg: '^#群聊报告\\s*(今天|昨天|前天|\\d{4}-\\d{2}-\\d{2})?$',
          fnc: 'generateReport',
          permission: 'all'
        },
        {
          reg: '^#强制群聊报告$',
          fnc: 'forceGenerateReport',
          permission: 'master'
        }
      ]
    })

    // ✅ 定时任务：每小时执行（MUST use arrow function）
    this.task = {
      name: '每小时群聊报告',
      cron: '0 * * * *',
      fnc: () => this.scheduledReport(),
      log: true
    }
  }

  /**
   * 初始化
   */
  async init() {
    const config = Config.get()

    // 初始化共享服务（由 Services 模块统一管理）
    getMessageCollector()
    const aiService = getAIService()
    getStatisticsService()
    getActivityVisualizer()

    // 初始化分析器（如果 AI 服务可用）
    getTopicAnalyzer()
    getGoldenQuoteAnalyzer()
    getUserTitleAnalyzer()

    // 显示功能状态
    const enabledFeatures = []
    if (aiService) {
      // AI 服务可用，显示 AI 增强功能
      if (config?.analysis?.topic?.enabled !== false) enabledFeatures.push('话题分析')
      if (config?.analysis?.goldenQuote?.enabled !== false) enabledFeatures.push('金句提取')
      if (config?.analysis?.userTitle?.enabled !== false) enabledFeatures.push('用户称号')
    }
    if (config?.analysis?.activity?.enabled !== false) enabledFeatures.push('活跃度图表')

    if (enabledFeatures.length > 0) {
      logger.info(`[群聊洞见-报告] 增强分析功能已启用: ${enabledFeatures.join('、')}`)
    }

    // 显示 AI 服务状态
    if (!aiService) {
      logger.warn('[群聊洞见-报告] AI 服务未启用，将使用基础统计功能')
    }

    // 显示定时总结状态
    const scheduleEnabled = config?.schedule?.enabled !== false
    const whitelist = config?.schedule?.whitelist || []
    if (scheduleEnabled && whitelist.length > 0) {
      logger.info(`[群聊洞见-报告] 定时总结已启用，白名单群数: ${whitelist.length}`)
    } else {
      logger.info('[群聊洞见-报告] 定时总结未启用（需配置白名单群）')
    }

    // 监听配置变更
    Config.onChange(async (newConfig) => {
      await reinitializeServices(newConfig)
      logger.mark('[群聊洞见-报告] 服务已重新初始化')
    })
  }

  /**
   * 定时任务：每小时生成群聊报告（带并发控制）
   */
  async scheduledReport() {
    const messageCollector = getMessageCollector()
    if (!messageCollector) {
      logger.warn('[群聊洞见-报告] 定时报告功能未就绪')
      return
    }

    const config = Config.get()
    const scheduleConfig = config?.schedule || {}
    const enabled = scheduleConfig.enabled !== false
    const whitelist = scheduleConfig.whitelist || []
    const minMessages = scheduleConfig.minMessages || 99
    const concurrency = scheduleConfig.concurrency || 3

    // 检查是否启用
    if (!enabled || whitelist.length === 0) {
      logger.debug('[群聊洞见-报告] 定时报告未启用或白名单为空，跳过')
      return
    }

    logger.mark(`[群聊洞见-报告] 开始执行定时报告任务 (白名单群数: ${whitelist.length}, 并发数: ${concurrency})`)

    // 使用并发限制处理白名单群
    const results = await this.runWithConcurrency(
      whitelist,
      async (groupId) => {
        try {
          // 获取今天的消息
          const messages = await messageCollector.getMessages(groupId, 1)

          if (messages.length < minMessages) {
            logger.debug(`[群聊洞见-报告] 群 ${groupId} 今日消息数 (${messages.length}) 少于阈值 (${minMessages})，跳过报告`)
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
            logger.debug(`[群聊洞见-报告] 获取群 ${groupId} 名称失败，使用默认名称`)
          }

          // 执行分析
          logger.info(`[群聊洞见-报告] 正在为群 ${groupId} (${groupName}) 生成报告 (消息数: ${messages.length})`)
          const analysisResults = await this.performAnalysis(messages, 1)

          if (!analysisResults) {
            logger.warn(`[群聊洞见-报告] 群 ${groupId} 报告生成失败：分析失败`)
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

          logger.mark(`[群聊洞见-报告] 群 ${groupId} 报告生成成功 (${messages.length} 条消息)`)
          return { groupId, status: 'success', messageCount: messages.length }
        } catch (err) {
          logger.error(`[群聊洞见-报告] 群 ${groupId} 定时报告异常: ${err}`)
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

    logger.mark(`[群聊洞见-报告] 定时报告任务执行完成 - 总数: ${summary.total}, 成功: ${summary.success}, 失败: ${summary.failed}, 跳过: ${summary.skipped}, 异常: ${summary.error}`)
  }

  /**
   * 并发限制执行器
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
   */
  async generateReport(e) {
    const messageCollector = getMessageCollector()
    const aiService = getAIService()

    if (!messageCollector) {
      return this.reply('报告功能未就绪', true)
    }

    try {
      // 解析查询参数
      const match = e.msg.match(/(今天|昨天|前天|(\d{4}-\d{2}-\d{2}))/)
      let queryDate = moment().format('YYYY-MM-DD')
      let dateLabel = '今天'

      if (match) {
        if (match[1] === '昨天') {
          queryDate = moment().subtract(1, 'days').format('YYYY-MM-DD')
          dateLabel = '昨天'
        } else if (match[1] === '前天') {
          queryDate = moment().subtract(2, 'days').format('YYYY-MM-DD')
          dateLabel = '前天'
        } else if (match[2]) {
          const date = moment(match[2], 'YYYY-MM-DD', true)
          if (date.isValid()) {
            queryDate = date.format('YYYY-MM-DD')
            dateLabel = moment(queryDate).format('YYYY年MM月DD日')
          } else {
            return this.reply('日期格式错误，请使用：YYYY-MM-DD（如 2024-11-01）', true)
          }
        } else if (match[1] === '今天') {
          dateLabel = '今天'
        }
      }

      // 从 Redis 获取指定日期的报告
      const report = await messageCollector.redisHelper.getReport(e.group_id, queryDate)

      if (!report) {
        return this.reply(`${dateLabel}还没有生成报告`, true)
      }

      logger.info(`[群聊洞见-报告] 用户 ${e.user_id} 查询群 ${e.group_id} 的${dateLabel}报告`)

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
        return this.reply(img)
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

        return this.reply(textSummary, true)
      }
    } catch (err) {
      logger.error(`[群聊洞见-报告] 查询报告错误: ${err}`)
      return this.reply(`查询报告失败: ${err.message}`, true)
    }
  }

  /**
   * 强制生成群聊报告（主人专用）
   */
  async forceGenerateReport(e) {
    const messageCollector = getMessageCollector()
    const aiService = getAIService()

    if (!messageCollector) {
      return this.reply('报告功能未就绪', true)
    }

    await this.reply('正在强制生成今天的群聊报告，请稍候...')

    try {
      // 获取今天的消息
      const messages = await messageCollector.getMessages(e.group_id, 1)

      if (messages.length === 0) {
        return this.reply('今天还没有消息，无法生成报告', true)
      }

      // 获取群名
      let groupName = '未知群聊'
      try {
        const groupInfo = await e.group.getInfo?.()
        groupName = groupInfo?.group_name || e.group?.name || e.group?.group_name || `群${e.group_id}`
      } catch (err) {
        groupName = `群${e.group_id}`
      }

      logger.info(`[群聊洞见-报告] 主人 ${e.user_id} 强制生成群 ${e.group_id} (${groupName}) 的报告 (消息数: ${messages.length})`)

      // 执行分析
      const analysisResults = await this.performAnalysis(messages, 1)

      if (!analysisResults) {
        return this.reply('分析失败，请查看日志', true)
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

      logger.mark(`[群聊洞见-报告] 主人强制生成报告成功 - 群 ${e.group_id}, 消息数: ${messages.length}`)

      // 渲染并发送报告
      const img = await this.renderReport(analysisResults, {
        groupName,
        provider: aiService?.provider || 'AI',
        model: aiService?.model || '',
        tokenUsage: analysisResults.tokenUsage,
        date: today
      })

      if (img) {
        return this.reply(img)
      } else {
        return this.reply('报告已生成并保存，但渲染失败', true)
      }
    } catch (err) {
      logger.error(`[群聊洞见-报告] 强制生成报告错误: ${err}`)
      return this.reply(`生成报告失败: ${err.message}`, true)
    }
  }

  /**
   * 执行分析
   */
  async performAnalysis(messages, days = 1) {
    try {
      const config = Config.get()
      const statisticsService = getStatisticsService()
      const topicAnalyzer = getTopicAnalyzer()
      const goldenQuoteAnalyzer = getGoldenQuoteAnalyzer()
      const userTitleAnalyzer = getUserTitleAnalyzer()

      logger.info(`[群聊洞见-报告] 开始增强分析 (消息数: ${messages.length})`)

      // 1. 基础统计分析
      const stats = statisticsService.analyze(messages)
      logger.info(`[群聊洞见-报告] 基础统计完成 - 参与用户: ${stats.basic.totalUsers}`)

      // 检查是否满足最小消息数阈值
      const minThreshold = config?.analysis?.min_messages_threshold || 20
      if (messages.length < minThreshold) {
        logger.warn(`[群聊洞见-报告] 消息数 (${messages.length}) 少于阈值 (${minThreshold}), 跳过 AI 分析`)
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
      if (config?.analysis?.topic?.enabled !== false && topicAnalyzer) {
        analysisPromises.push(
          topicAnalyzer.analyze(messages, stats)
            .then(result => ({ type: 'topics', data: result.topics, usage: result.usage }))
            .catch(err => {
              logger.error(`[群聊洞见-报告] 话题分析失败: ${err}`)
              return { type: 'topics', data: [], usage: null }
            })
        )
      }

      // 金句提取
      if (config?.analysis?.goldenQuote?.enabled !== false && goldenQuoteAnalyzer) {
        analysisPromises.push(
          goldenQuoteAnalyzer.analyze(messages, stats)
            .then(result => ({ type: 'goldenQuotes', data: result.goldenQuotes, usage: result.usage }))
            .catch(err => {
              logger.error(`[群聊洞见-报告] 金句提取失败: ${err}`)
              return { type: 'goldenQuotes', data: [], usage: null }
            })
        )
      }

      // 用户称号
      if (config?.analysis?.userTitle?.enabled !== false && userTitleAnalyzer) {
        analysisPromises.push(
          userTitleAnalyzer.analyze(messages, stats)
            .then(result => ({ type: 'userTitles', data: result.userTitles, usage: result.usage }))
            .catch(err => {
              logger.error(`[群聊洞见-报告] 用户称号分析失败: ${err}`)
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

      logger.info(`[群聊洞见-报告] 增强分析完成 - 话题: ${analysisResults.topics.length}, 金句: ${analysisResults.goldenQuotes.length}, 称号: ${analysisResults.userTitles.length}, Tokens: ${analysisResults.tokenUsage.total_tokens}`)

      return analysisResults
    } catch (err) {
      logger.error(`[群聊洞见-报告] 增强分析失败: ${err}`)
      return null
    }
  }

  /**
   * 渲染报告
   */
  async renderReport(analysisResults, options) {
    try {
      const config = Config.get()
      const activityVisualizer = getActivityVisualizer()
      const { stats, topics, goldenQuotes, userTitles } = analysisResults

      // 生成活跃度图表 HTML
      const activityChart = config?.analysis?.activity?.enabled !== false
        ? activityVisualizer.generateChart(stats.hourly)
        : ''

      // 格式化日期范围
      const dateRange = stats.basic.dateRange.start === stats.basic.dateRange.end
        ? stats.basic.dateRange.start
        : `${stats.basic.dateRange.start} ~ ${stats.basic.dateRange.end}`

      // 获取渲染质量配置
      const renderConfig = config?.summary?.render || {}
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
        enableActivityChart: config?.analysis?.activity?.enabled !== false,
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

        pluResPath: join(pluginRoot, 'resources') + '/'
      }

      // 使用增强模板渲染
      const img = await puppeteer.screenshot('group-insight-enhanced', {
        tplFile: join(pluginRoot, 'resources/summary/enhanced.html'),
        imgType,
        quality,
        ...templateData
      })

      return img
    } catch (err) {
      logger.error(`[群聊洞见-报告] 渲染增强总结失败: ${err}`)
      return null
    }
  }
}
