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
          reg: '^#群聊(总结|报告)\\s*(今天|昨天|前天|\\d{4}-\\d{2}-\\d{2})?$',
          fnc: 'generateReport',
          permission: 'all'
        },
        {
          reg: '^#强制生成报告\\s*(今天|昨天|前天|\\d{4}-\\d{2}-\\d{2})?$',
          fnc: 'forceGenerateReport',
          permission: 'master'
        }
      ]
    })

    // ✅ 定时任务：每天23:59执行
    this.task = {
      name: '每日群聊报告',
      cron: '59 23 * * *',
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
   * 检查群聊报告生成冷却状态
   * @param {string} groupId - 群号
   * @param {boolean} ignoreCooldown - 是否忽略冷却限制（主人/定时任务使用）
   * @returns {Object} { inCooldown, remainingMinutes, lastGenerated }
   */
  async checkCooldown(groupId, ignoreCooldown = false) {
    if (ignoreCooldown) {
      return { inCooldown: false, remainingMinutes: 0, lastGenerated: null }
    }

    try {
      const config = Config.get()
      const cooldownMinutes = config?.schedule?.cooldownMinutes || 60
      const today = moment().format('YYYY-MM-DD')
      const cooldownKey = `Yz:groupManager:cooldown:${groupId}:${today}`

      // 检查 Redis 中的冷却记录
      const cooldownData = await redis.hGetAll(cooldownKey)

      if (!cooldownData || !cooldownData.generatedAt) {
        return { inCooldown: false, remainingMinutes: 0, lastGenerated: null }
      }

      const generatedAt = parseInt(cooldownData.generatedAt)
      const now = Date.now()
      const elapsedMinutes = Math.floor((now - generatedAt) / 1000 / 60)
      const remainingMinutes = cooldownMinutes - elapsedMinutes

      if (remainingMinutes > 0) {
        return {
          inCooldown: true,
          remainingMinutes,
          lastGenerated: {
            timestamp: generatedAt,
            generatedBy: cooldownData.generatedBy || 'user',
            messageCount: parseInt(cooldownData.messageCount || 0),
            elapsedMinutes
          }
        }
      }

      return { inCooldown: false, remainingMinutes: 0, lastGenerated: null }
    } catch (err) {
      logger.error(`[群聊洞见-报告] 检查冷却状态失败: ${err}`)
      // 发生错误时允许生成（避免阻塞用户）
      return { inCooldown: false, remainingMinutes: 0, lastGenerated: null }
    }
  }

  /**
   * 设置群聊报告生成冷却
   * @param {string} groupId - 群号
   * @param {string} generatedBy - 生成来源 ('user' | 'scheduled' | 'master')
   * @param {number} messageCount - 消息数量
   */
  async setCooldown(groupId, generatedBy = 'user', messageCount = 0) {
    try {
      const today = moment().format('YYYY-MM-DD')
      const cooldownKey = `Yz:groupManager:cooldown:${groupId}:${today}`

      await redis.hSet(cooldownKey, {
        generatedAt: Date.now().toString(),
        generatedBy,
        messageCount: messageCount.toString()
      })

      // 设置过期时间为24小时（跨日自动清理）
      await redis.expire(cooldownKey, 86400)

      logger.debug(`[群聊洞见-报告] 已设置冷却标记: 群 ${groupId}, 来源: ${generatedBy}`)
    } catch (err) {
      logger.error(`[群聊洞见-报告] 设置冷却标记失败: ${err}`)
    }
  }

  /**
   * 定时任务：每天23:59生成群聊报告（带并发控制）
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
          const today = moment().format('YYYY-MM-DD')
          const analysisResults = await this.performAnalysis(messages, 1, groupId, today)

          if (!analysisResults) {
            logger.warn(`[群聊洞见-报告] 群 ${groupId} 报告生成失败：分析失败`)
            return { groupId, status: 'failed', error: 'analysis_failed' }
          }

          // 保存报告到 Redis
          await messageCollector.redisHelper.saveReport(groupId, today, {
            stats: analysisResults.stats,
            topics: analysisResults.topics,
            goldenQuotes: analysisResults.goldenQuotes,
            userTitles: analysisResults.userTitles,
            messageCount: messages.length,
            tokenUsage: analysisResults.tokenUsage
          })

          // 设置冷却标记（防止定时任务后1小时内频繁手动触发）
          await this.setCooldown(groupId, 'scheduled', messages.length)

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
   * 查询/生成群聊报告
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
      let isToday = true

      if (match) {
        if (match[1] === '昨天') {
          queryDate = moment().subtract(1, 'days').format('YYYY-MM-DD')
          dateLabel = '昨天'
          isToday = false
        } else if (match[1] === '前天') {
          queryDate = moment().subtract(2, 'days').format('YYYY-MM-DD')
          dateLabel = '前天'
          isToday = false
        } else if (match[2]) {
          const date = moment(match[2], 'YYYY-MM-DD', true)
          if (date.isValid()) {
            queryDate = date.format('YYYY-MM-DD')
            dateLabel = moment(queryDate).format('YYYY年MM月DD日')
            isToday = queryDate === moment().format('YYYY-MM-DD')
          } else {
            return this.reply('日期格式错误，请使用：YYYY-MM-DD（如 2024-11-01）', true)
          }
        } else if (match[1] === '今天') {
          dateLabel = '今天'
          isToday = true
        }
      }

      // 从 Redis 获取指定日期的报告
      let report = await messageCollector.redisHelper.getReport(e.group_id, queryDate)

      // 如果是查询历史日期且报告不存在，直接提示
      if (!isToday && !report) {
        return this.reply(`${dateLabel}还没有生成报告`, true)
      }

      // 如果是查询今天的报告
      if (isToday) {
        // 检查冷却状态
        const cooldown = await this.checkCooldown(e.group_id, false)

        // 如果在冷却期内，返回缓存的报告
        if (cooldown.inCooldown && report) {
          const elapsedMinutes = cooldown.lastGenerated.elapsedMinutes
          logger.info(`[群聊洞见-报告] 用户 ${e.user_id} 查询群 ${e.group_id} 的今天报告（冷却中，${elapsedMinutes}分钟前已生成）`)

          // 获取群名并渲染报告
          let groupName = '未知群聊'
          try {
            const groupInfo = await e.group.getInfo?.()
            groupName = groupInfo?.group_name || e.group?.name || e.group?.group_name || `群${e.group_id}`
          } catch (err) {
            groupName = `群${e.group_id}`
          }

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
            return this.reply('渲染失败', true)
          }
        }

        // 不在冷却期或缓存不存在，触发生成
        if (!cooldown.inCooldown || !report) {
          await this.reply('正在生成今天的群聊报告，请稍候...')

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

          logger.info(`[群聊洞见-报告] 用户 ${e.user_id} 触发生成群 ${e.group_id} (${groupName}) 的报告 (消息数: ${messages.length})`)

          // 执行分析
          const analysisResults = await this.performAnalysis(messages, 1, e.group_id, queryDate)

          if (!analysisResults) {
            return this.reply('分析失败，请查看日志', true)
          }

          // 保存报告到 Redis
          await messageCollector.redisHelper.saveReport(e.group_id, queryDate, {
            stats: analysisResults.stats,
            topics: analysisResults.topics,
            goldenQuotes: analysisResults.goldenQuotes,
            userTitles: analysisResults.userTitles,
            messageCount: messages.length,
            tokenUsage: analysisResults.tokenUsage
          })

          // 设置冷却
          await this.setCooldown(e.group_id, 'user', messages.length)

          logger.mark(`[群聊洞见-报告] 用户触发报告生成成功 - 群 ${e.group_id}, 消息数: ${messages.length}`)

          // 渲染并发送报告
          const savedReport = await messageCollector.redisHelper.getReport(e.group_id, queryDate)
          const img = await this.renderReport(savedReport || analysisResults, {
            groupName,
            provider: aiService?.provider || 'AI',
            model: aiService?.model || '',
            tokenUsage: (savedReport || analysisResults).tokenUsage,
            date: queryDate
          })

          if (img) {
            return this.reply(img)
          } else {
            return this.reply('报告已生成并保存，但渲染失败', true)
          }
        }
      }

      // 历史报告存在，直接渲染返回
      if (report) {
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

    try {
      // 解析日期参数
      const match = e.msg.match(/(今天|昨天|前天|(\d{4}-\d{2}-\d{2}))/)
      let targetDate = moment().format('YYYY-MM-DD')
      let dateLabel = '今天'
      let daysOffset = 0

      if (match) {
        if (match[1] === '昨天') {
          targetDate = moment().subtract(1, 'days').format('YYYY-MM-DD')
          dateLabel = '昨天'
          daysOffset = 1
        } else if (match[1] === '前天') {
          targetDate = moment().subtract(2, 'days').format('YYYY-MM-DD')
          dateLabel = '前天'
          daysOffset = 2
        } else if (match[2]) {
          const date = moment(match[2], 'YYYY-MM-DD', true)
          if (date.isValid()) {
            targetDate = date.format('YYYY-MM-DD')
            dateLabel = moment(targetDate).format('YYYY年MM月DD日')
            daysOffset = moment().diff(date, 'days')
          } else {
            return this.reply('日期格式错误，请使用：YYYY-MM-DD（如 2024-11-01）', true)
          }
        } else if (match[1] === '今天') {
          dateLabel = '今天'
          daysOffset = 0
        }
      }

      await this.reply(`正在强制生成${dateLabel}的群聊报告，请稍候...`)

      // 获取指定日期的消息
      const messages = await messageCollector.getMessages(e.group_id, 1, daysOffset)

      if (messages.length === 0) {
        return this.reply(`${dateLabel}还没有消息，无法生成报告`, true)
      }

      // 获取群名
      let groupName = '未知群聊'
      try {
        const groupInfo = await e.group.getInfo?.()
        groupName = groupInfo?.group_name || e.group?.name || e.group?.group_name || `群${e.group_id}`
      } catch (err) {
        groupName = `群${e.group_id}`
      }

      logger.info(`[群聊洞见-报告] 主人 ${e.user_id} 强制生成群 ${e.group_id} (${groupName}) 的${dateLabel}报告 (消息数: ${messages.length})`)

      // 执行分析
      const analysisResults = await this.performAnalysis(messages, 1, e.group_id, targetDate)

      if (!analysisResults) {
        return this.reply('分析失败，请查看日志', true)
      }

      // 保存报告到 Redis（覆盖已有报告）
      await messageCollector.redisHelper.saveReport(e.group_id, targetDate, {
        stats: analysisResults.stats,
        topics: analysisResults.topics,
        goldenQuotes: analysisResults.goldenQuotes,
        userTitles: analysisResults.userTitles,
        messageCount: messages.length,
        tokenUsage: analysisResults.tokenUsage
      })

      // 设置冷却标记（主人下次触发依然会无视冷却）
      await this.setCooldown(e.group_id, 'master', messages.length)

      logger.mark(`[群聊洞见-报告] 主人强制生成${dateLabel}报告成功 - 群 ${e.group_id}, 消息数: ${messages.length}`)

      // 渲染并发送报告
      const savedReport = await messageCollector.redisHelper.getReport(e.group_id, targetDate)
      const img = await this.renderReport(savedReport || analysisResults, {
        groupName,
        provider: aiService?.provider || 'AI',
        model: aiService?.model || '',
        tokenUsage: (savedReport || analysisResults).tokenUsage,
        date: targetDate
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
   * @param {Array} messages - 消息数组
   * @param {number} days - 分析天数
   * @param {string} groupId - 群号（用于增量分析）
   * @param {string} date - 日期（用于增量分析）
   */
  async performAnalysis(messages, days = 1, groupId = null, date = null) {
    try {
      const config = Config.get()
      const statisticsService = getStatisticsService()
      const topicAnalyzer = getTopicAnalyzer()
      const goldenQuoteAnalyzer = getGoldenQuoteAnalyzer()
      const userTitleAnalyzer = getUserTitleAnalyzer()
      const maxMessages = config.ai?.maxMessages || 1000
      const contextOverlap = 50 // 上下文重叠消息数

      logger.info(`[群聊洞见-报告] 开始增强分析 (消息数: ${messages.length})`)

      // 1. 基础统计分析（始终全量计算）
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

      // 2. 检查是否需要使用批次缓存+增量分析
      let topics = []
      let goldenQuotes = []
      let topicUsage = null
      let quoteUsage = null
      let useIncrementalAnalysis = false
      let batchTokenUsage = {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }

      if (groupId && date && messages.length > maxMessages && days === 1) {
        try {
          // 计算已完成的批次数量
          const completedBatches = Math.floor(messages.length / maxMessages)
          const remainingMessages = messages.length % maxMessages

          logger.info(`[群聊洞见-报告] 消息总数: ${messages.length}, 完整批次: ${completedBatches}, 剩余: ${remainingMessages}`)

          // 获取所有批次的缓存（只使用成功的批次，忽略失败/缺失的）
          const batchCaches = []
          const failedBatches = []
          const missingBatches = []

          for (let i = 0; i < completedBatches; i++) {
            const cacheKey = `Yz:groupManager:batch:${groupId}:${date}:${i}`
            const cachedData = await redis.get(cacheKey)

            if (cachedData) {
              try {
                const parsed = JSON.parse(cachedData)
                if (parsed.success) {
                  batchCaches.push(parsed)

                  // 累加批次的 token 使用情况
                  if (parsed.tokenUsage) {
                    batchTokenUsage.prompt_tokens += parsed.tokenUsage.prompt_tokens || 0
                    batchTokenUsage.completion_tokens += parsed.tokenUsage.completion_tokens || 0
                    batchTokenUsage.total_tokens += parsed.tokenUsage.total_tokens || 0
                  }

                  logger.info(`[群聊洞见-报告] 批次${i}缓存有效 - 话题: ${parsed.topics?.length || 0}, 金句: ${parsed.goldenQuotes?.length || 0}, Tokens: ${parsed.tokenUsage?.total_tokens || 0}`)
                } else {
                  failedBatches.push(i)
                  logger.warn(`[群聊洞见-报告] 批次${i}分析曾失败，跳过此批次`)
                }
              } catch (err) {
                logger.error(`[群聊洞见-报告] 批次${i}缓存解析失败: ${err}`)
                failedBatches.push(i)
              }
            } else {
              missingBatches.push(i)
              logger.info(`[群聊洞见-报告] 批次${i}缓存不存在，跳过此批次`)
            }
          }

          // 如果有任何成功的批次缓存，就使用增量分析
          if (batchCaches.length > 0) {
            useIncrementalAnalysis = true

            // 合并所有批次的结果
            let mergedTopics = []
            let mergedQuotes = []

            for (const batch of batchCaches) {
              logger.debug(`[群聊洞见-报告] 合并批次${batch.batchIndex} - 话题: ${batch.topics?.length || 0}, 金句: ${batch.goldenQuotes?.length || 0}`)
              mergedTopics = this.mergeTopics(mergedTopics, batch.topics || [])
              mergedQuotes = this.mergeGoldenQuotes(mergedQuotes, batch.goldenQuotes || [])
            }

            const skippedInfo = []
            if (failedBatches.length > 0) skippedInfo.push(`失败: ${failedBatches.join(',')}`)
            if (missingBatches.length > 0) skippedInfo.push(`缺失: ${missingBatches.join(',')}`)
            const skippedText = skippedInfo.length > 0 ? ` (跳过批次 ${skippedInfo.join(', ')})` : ''

            logger.info(`[群聊洞见-报告] 已合并${batchCaches.length}/${completedBatches}个批次 - 话题: ${mergedTopics.length}, 金句: ${mergedQuotes.length}, Tokens: ${batchTokenUsage.total_tokens}${skippedText}`)

            // 如果有剩余消息，分析增量部分
            if (remainingMessages > 0) {
              const lastBatchEnd = completedBatches * maxMessages
              const incrementalMessages = [
                ...messages.slice(lastBatchEnd - contextOverlap, lastBatchEnd), // 上下文
                ...messages.slice(lastBatchEnd) // 增量消息
              ]

              logger.info(`[群聊洞见-报告] 分析增量消息: ${incrementalMessages.length}条 (含${contextOverlap}条上下文)`)

              const [incrementalTopics, incrementalQuotes] = await Promise.all([
                config?.analysis?.topic?.enabled !== false && topicAnalyzer
                  ? topicAnalyzer.analyze(incrementalMessages, stats)
                      .then(result => ({ topics: result.topics, usage: result.usage }))
                      .catch(err => {
                        logger.error(`[群聊洞见-报告] 增量话题分析失败: ${err}`)
                        return { topics: [], usage: null }
                      })
                  : Promise.resolve({ topics: [], usage: null }),

                config?.analysis?.goldenQuote?.enabled !== false && goldenQuoteAnalyzer
                  ? goldenQuoteAnalyzer.analyze(incrementalMessages, stats)
                      .then(result => ({ goldenQuotes: result.goldenQuotes, usage: result.usage }))
                      .catch(err => {
                        logger.error(`[群聊洞见-报告] 增量金句分析失败: ${err}`)
                        return { goldenQuotes: [], usage: null }
                      })
                  : Promise.resolve({ goldenQuotes: [], usage: null })
              ])

              // 合并增量结果
              logger.debug(`[群聊洞见-报告] 增量分析结果 - 话题: ${incrementalTopics.topics?.length || 0}, 金句: ${incrementalQuotes.goldenQuotes?.length || 0}`)
              logger.debug(`[群聊洞见-报告] 合并前批次缓存 - 话题: ${mergedTopics.length}, 金句: ${mergedQuotes.length}`)

              topics = this.mergeTopics(mergedTopics, incrementalTopics.topics || [])
              goldenQuotes = this.mergeGoldenQuotes(mergedQuotes, incrementalQuotes.goldenQuotes || [])
              topicUsage = incrementalTopics.usage
              quoteUsage = incrementalQuotes.usage

              logger.info(`[群聊洞见-报告] 增量合并完成 - 最终话题: ${topics.length}, 金句: ${goldenQuotes.length}`)
            } else {
              // 没有增量消息，直接使用合并的批次结果
              topics = mergedTopics
              goldenQuotes = mergedQuotes
              logger.info(`[群聊洞见-报告] 无增量消息，使用批次缓存结果 - 话题: ${topics.length}, 金句: ${goldenQuotes.length}`)
            }
          }
        } catch (err) {
          logger.error(`[群聊洞见-报告] 批次缓存处理失败，回退到全量分析: ${err}`)
          useIncrementalAnalysis = false
        }
      }

      // 3. 如果未使用增量分析，则执行常规全量分析
      if (!useIncrementalAnalysis) {
        // 全量分析时，如果消息数超过maxMessages，只分析最新的maxMessages条
        let messagesToAnalyze = messages
        if (messages.length > maxMessages) {
          messagesToAnalyze = messages.slice(-maxMessages)
          logger.info(`[群聊洞见-报告] 消息数${messages.length}超过阈值，全量分析最新的${maxMessages}条消息`)
        }

        const analysisPromises = []

        // 话题分析
        if (config?.analysis?.topic?.enabled !== false && topicAnalyzer) {
          analysisPromises.push(
            topicAnalyzer.analyze(messagesToAnalyze, stats)
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
            goldenQuoteAnalyzer.analyze(messagesToAnalyze, stats)
              .then(result => ({ type: 'goldenQuotes', data: result.goldenQuotes, usage: result.usage }))
              .catch(err => {
                logger.error(`[群聊洞见-报告] 金句提取失败: ${err}`)
                return { type: 'goldenQuotes', data: [], usage: null }
              })
          )
        }

        // 等待分析完成
        const results = await Promise.all(analysisPromises)

        for (const result of results) {
          if (result.type === 'topics') {
            topics = result.data
            topicUsage = result.usage
          } else if (result.type === 'goldenQuotes') {
            goldenQuotes = result.data
            quoteUsage = result.usage
          }
        }
      }

      // 4. 用户称号分析（始终基于统计数据实时计算）
      let userTitles = []
      let titleUsage = null

      if (config?.analysis?.userTitle?.enabled !== false && userTitleAnalyzer) {
        try {
          const titleResult = await userTitleAnalyzer.analyze(messages, stats)
          userTitles = titleResult.userTitles
          titleUsage = titleResult.usage
        } catch (err) {
          logger.error(`[群聊洞见-报告] 用户称号分析失败: ${err}`)
        }
      }

      // 5. 整合结果
      const analysisResults = {
        stats,
        topics,
        goldenQuotes,
        userTitles,
        skipped: false,
        useIncrementalAnalysis, // 标记是否使用了增量分析
        tokenUsage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      }

      // 累加 token 使用情况（包括批次缓存的 token）
      for (const usage of [batchTokenUsage, topicUsage, quoteUsage, titleUsage]) {
        if (usage && usage.total_tokens > 0) {
          analysisResults.tokenUsage.prompt_tokens += usage.prompt_tokens || 0
          analysisResults.tokenUsage.completion_tokens += usage.completion_tokens || 0
          analysisResults.tokenUsage.total_tokens += usage.total_tokens || 0
        }
      }

      const analysisMode = useIncrementalAnalysis ? '增量' : '全量'
      logger.info(`[群聊洞见-报告] ${analysisMode}分析完成 - 话题: ${topics.length}, 金句: ${goldenQuotes.length}, 称号: ${userTitles.length}, Tokens: ${analysisResults.tokenUsage.total_tokens}`)

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

        // 元数据 - 使用报告数据中的 savedAt 时间戳
        createTime: analysisResults.savedAt ? moment(analysisResults.savedAt).format('YYYY-MM-DD HH:mm:ss') : moment().format('YYYY-MM-DD HH:mm:ss'),
        tokenUsage,

        pluResPath: join(pluginRoot, 'resources') + '/'
      }

      // 渲染群聊总结报告
      const img = await puppeteer.screenshot('group-insight', {
        tplFile: join(pluginRoot, 'resources/summary/index.html'),
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

  /**
   * 合并话题分析结果
   * @param {Array} cachedTopics - 缓存的话题
   * @param {Array} incrementalTopics - 增量话题
   * @returns {Array} 合并后的话题
   */
  mergeTopics(cachedTopics, incrementalTopics) {
    const topicMap = new Map()

    // 添加缓存的话题（修复：使用正确的字段名 topic.topic）
    cachedTopics.forEach(topic => {
      topicMap.set(topic.topic, topic)
    })

    // 合并增量话题
    incrementalTopics.forEach(topic => {
      if (topicMap.has(topic.topic)) {
        // 精确匹配到相同话题名，合并信息
        const existing = topicMap.get(topic.topic)

        // 保留原描述，追加新描述
        existing.detail = `${existing.detail}\n\n[后续]: ${topic.detail}`

        // 合并贡献者（去重）
        const existingUserIds = new Set(existing.contributors.map(c => c.user_id || c.nickname))
        topic.contributors.forEach(c => {
          const userId = c.user_id || c.nickname
          if (!existingUserIds.has(userId)) {
            existing.contributors.push(c)
          }
        })
      } else {
        // 新话题，直接添加
        topicMap.set(topic.topic, topic)
      }
    })

    // 返回所有话题（不限制数量）
    return Array.from(topicMap.values())
  }

  /**
   * 合并金句分析结果
   * @param {Array} cachedQuotes - 缓存的金句
   * @param {Array} incrementalQuotes - 增量金句
   * @returns {Array} 合并后的金句
   */
  mergeGoldenQuotes(cachedQuotes, incrementalQuotes) {
    const quoteSet = new Set()
    const allQuotes = []

    // 使用 user_id + quote 作为去重键（金句结构：{ quote, sender: { user_id, nickname }, reason }）
    const combined = [...cachedQuotes, ...incrementalQuotes]
    combined.forEach(quote => {
      const userId = quote.sender?.user_id || quote.sender?.nickname || 'unknown'
      const quoteText = quote.quote || ''
      const key = `${userId}_${quoteText}`
      if (!quoteSet.has(key)) {
        quoteSet.add(key)
        allQuotes.push(quote)
      }
    })

    // 返回所有金句（不限制数量）
    return allQuotes
  }
}
