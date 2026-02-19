/**
 * 群聊报告功能
 */
import plugin from '../../../lib/plugins/plugin.js'
import moment from 'moment'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import {
  Config,
  getMessageCollector,
  getAIService,
  getStatisticsService,
  getActivityVisualizer,
  getTopicAnalyzer,
  getGoldenQuoteAnalyzer,
  getUserTitleAnalyzer
} from '../components/index.js'
import { RESOURCES_DIR, getSummaryTemplatePath, getSummaryTemplateDir } from '#paths'
import { logger } from '#lib'

export class ReportPlugin extends plugin {
  constructor() {
    super({
      name: '群聊洞见',
      dsc: 'AI 增强分析报告',
      event: 'message',
      priority: 5000,
      rule: [
        {
          reg: '^#群聊(总结|报告)\\s*(\\d{5,12})?\\s*(今天|昨天|前天|\\d{4}-\\d{2}-\\d{2})?$',
          fnc: 'generateReport',
          permission: 'all'
        },
        {
          reg: '^#强制生成报告\\s*(\\d{5,12})?\\s*(今天|昨天|前天|\\d{4}-\\d{2}-\\d{2})?$',
          fnc: 'forceGenerateReport',
          permission: 'master'
        }
      ]
    })

    // ✅ 定时任务
    this.task = this.buildScheduledTasks()
  }

  /**
   * 构建定时任务列表
   * @returns {Array} 定时任务数组
   */
  buildScheduledTasks() {
    const config = Config.get()
    const scheduleConfig = config?.schedule || {}
    const sendConfig = scheduleConfig.send || {}

    const tasks = []

    // 定时任务1：每天23:59生成报告
    tasks.push({
      name: '每日群聊报告生成',
      cron: '59 23 * * *',
      fnc: () => this.scheduledReport(),
      log: true
    })

    // 定时任务2：定时发送报告（仅 scheduled 模式）
    if (sendConfig.mode === 'scheduled') {
      const sendHour = sendConfig.sendHour ?? 8 // 默认早8点
      const sendMinute = sendConfig.sendMinute ?? 0 // 默认整点
      const cron = `${sendMinute} ${sendHour} * * *`
      tasks.push({
        name: '每日群聊报告发送',
        cron,
        fnc: () => this.scheduledSendReport(),
        log: true
      })
    }

    return tasks
  }

  /**
   * 初始化
   */
  async init() {
    const config = Config.get()

    // 初始化共享服务
    const [messageCollector, aiService, statisticsService, activityVisualizer] = await Promise.all([
      getMessageCollector(),
      getAIService(),
      getStatisticsService(),
      getActivityVisualizer()
    ])

    // 初始化分析器（如果 AI 服务可用）
    if (aiService) {
      await Promise.all([
        getTopicAnalyzer(),
        getGoldenQuoteAnalyzer(),
        getUserTitleAnalyzer()
      ])
    }

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
      logger.info(`[报告] 增强分析功能已启用: ${enabledFeatures.join('、')}`)
    }

    // 显示 AI 服务状态
    if (!aiService) {
      logger.warn('[报告] AI 服务未启用，将使用基础统计功能')
    }

    // 显示定时总结状态
    const scheduleEnabled = config?.schedule?.enabled !== false
    const whitelist = config?.schedule?.whitelist || []
    const sendConfig = config?.schedule?.send || {}
    const sendMode = sendConfig.mode || 'disabled'

    if (scheduleEnabled && whitelist.length > 0) {
      const sendHour = sendConfig.sendHour ?? 8
      const sendMinute = sendConfig.sendMinute ?? 0
      const timeStr = `${String(sendHour).padStart(2, '0')}:${String(sendMinute).padStart(2, '0')}`
      const sendModeLabel = {
        'disabled': '仅保存',
        'immediate': '立即发送',
        'scheduled': `定时发送 (每天 ${timeStr})`
      }[sendMode] || '仅保存'

      logger.info(`[报告] 定时总结已启用，白名单群数: ${whitelist.length}，发送模式: ${sendModeLabel}`)
    } else {
      logger.info('[报告] 定时总结未启用（需配置白名单群）')
    }

  }

  /**
   * 检查群聊报告生成冷却状态
   * @param {number} groupId - 群号
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
      logger.error(`[报告] 检查冷却状态失败: ${err}`)
      // 发生错误时允许生成（避免阻塞用户）
      return { inCooldown: false, remainingMinutes: 0, lastGenerated: null }
    }
  }

  /**
   * 设置群聊报告生成冷却
   * @param {number} groupId - 群号
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

      logger.debug(`[报告] 已设置冷却标记: 群 ${groupId}, 来源: ${generatedBy}`)
    } catch (err) {
      logger.error(`[报告] 设置冷却标记失败: ${err}`)
    }
  }

  /**
   * 获取生成锁（开始生成前调用）
   * @param {number} groupId - 群号
   * @param {string} date - 日期
   * @param {number} ttl - 锁超时时间（秒），默认5分钟
   * @returns {Promise<boolean>} 是否成功获取锁
   */
  async acquireGeneratingLock(groupId, date, ttl = 300) {
    try {
      const lockKey = `Yz:groupManager:generating:${groupId}:${date}`
      // 使用 SETNX 确保原子性获取锁
      const result = await redis.set(lockKey, Date.now().toString(), 'EX', ttl, 'NX')
      if (result) {
        logger.debug(`[报告] 获取生成锁成功: 群 ${groupId}, 日期 ${date}`)
        return true
      }
      logger.debug(`[报告] 获取生成锁失败（已被占用）: 群 ${groupId}, 日期 ${date}`)
      return false
    } catch (err) {
      logger.error(`[报告] 获取生成锁失败: ${err}`)
      return false
    }
  }

  /**
   * 释放生成锁（生成完成后调用）
   * @param {number} groupId - 群号
   * @param {string} date - 日期
   */
  async releaseGeneratingLock(groupId, date) {
    try {
      const lockKey = `Yz:groupManager:generating:${groupId}:${date}`
      await redis.del(lockKey)
      logger.debug(`[报告] 释放生成锁: 群 ${groupId}, 日期 ${date}`)
    } catch (err) {
      logger.error(`[报告] 释放生成锁失败: ${err}`)
    }
  }

  /**
   * 定时任务：每天23:59生成群聊报告（带并发控制）
   */
  async scheduledReport() {
    const messageCollector = await getMessageCollector()
    if (!messageCollector) {
      logger.warn('[报告] 定时报告功能未就绪')
      return
    }

    const config = Config.get()
    const scheduleConfig = config?.schedule || {}
    const sendConfig = scheduleConfig.send || {}
    const enabled = scheduleConfig.enabled !== false
    const whitelist = scheduleConfig.whitelist || []
    const minMessages = scheduleConfig.minMessages || 99
    const concurrency = scheduleConfig.concurrency || 3
    const sendMode = sendConfig.mode || 'disabled'

    // 检查是否启用
    if (!enabled || whitelist.length === 0) {
      logger.debug('[报告] 定时报告未启用或白名单为空，跳过')
      return
    }

    // 固定目标日期为任务触发时的"今天"，避免跨日边界问题
    const targetDate = moment().format('YYYY-MM-DD')
    logger.mark(`[报告] 开始执行定时报告任务 (目标日期: ${targetDate}, 白名单群数: ${whitelist.length}, 并发数: ${concurrency}, 发送模式: ${sendMode})`)

    // 使用并发限制处理白名单群
    const results = await this.runWithConcurrency(
      whitelist,
      async (groupId) => {
        try {
          // 获取目标日期的消息（使用固定日期，避免处理过程中跨日导致日期错误）
          const messages = await messageCollector.getMessages(groupId, 1, targetDate)

          if (messages.length < minMessages) {
            logger.debug(`[报告] 群 ${groupId} ${targetDate} 消息数 (${messages.length}) 少于阈值 (${minMessages})，跳过报告`)
            return { groupId, status: 'skipped', reason: 'insufficient_messages' }
          }

          // 尝试获取生成锁
          if (!await this.acquireGeneratingLock(groupId, targetDate)) {
            logger.info(`[报告] 群 ${groupId} ${targetDate} 报告正在生成中，跳过定时任务`)
            return { groupId, status: 'skipped', reason: 'already_generating' }
          }

          try {
            // 获取群名
            let groupName = `群${groupId}`
            try {
              const group = Bot.pickGroup?.(groupId)
              if (group) {
                const groupInfo = await group.getInfo?.()
                groupName = groupInfo?.group_name || groupInfo?.name || groupName
              }
            } catch (err) {
              logger.debug(`[报告] 获取群 ${groupId} 名称失败，使用默认名称`)
            }

            // 执行分析
            logger.info(`[报告] 正在为群 ${groupId} (${groupName}) 生成 ${targetDate} 报告 (消息数: ${messages.length})`)
            const analysisResults = await this.performAnalysis(messages, 1, groupId, targetDate)

            if (!analysisResults) {
              logger.warn(`[报告] 群 ${groupId} 报告生成失败：分析失败`)
              return { groupId, status: 'failed', error: 'analysis_failed' }
            }

            // 保存报告到 Redis（使用固定的目标日期）
            await messageCollector.redisHelper.saveReport(groupId, targetDate, {
              stats: analysisResults.stats,
              topics: analysisResults.topics,
              goldenQuotes: analysisResults.goldenQuotes,
              userTitles: analysisResults.userTitles,
              messageCount: messages.length,
              tokenUsage: analysisResults.tokenUsage
            })

            // 设置冷却标记（防止定时任务后1小时内频繁手动触发）
            await this.setCooldown(groupId, 'scheduled', messages.length)

            logger.mark(`[报告] 群 ${groupId} ${targetDate} 报告生成成功 (${messages.length} 条消息)`)

            // immediate 模式：生成后立即发送
            let sendResult = null
            if (sendMode === 'immediate') {
              sendResult = await this.sendReportToGroup(groupId, targetDate, { groupName })
              if (sendResult.success) {
                logger.info(`[报告] 群 ${groupId} 报告已立即发送`)
              } else {
                logger.warn(`[报告] 群 ${groupId} 报告立即发送失败: ${sendResult.error}`)
              }
            }

            return {
              groupId,
              status: 'success',
              messageCount: messages.length,
              sent: sendMode === 'immediate' ? sendResult?.success : undefined
            }
          } finally {
            // 无论成功失败都释放锁
            await this.releaseGeneratingLock(groupId, targetDate)
          }
        } catch (err) {
          logger.error(`[报告] 群 ${groupId} 定时报告异常: ${err}`)
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

    // immediate 模式下统计发送情况
    if (sendMode === 'immediate') {
      const sentCount = results.filter(r => r.sent === true).length
      logger.mark(`[报告] 定时报告任务执行完成 - 总数: ${summary.total}, 成功: ${summary.success}, 失败: ${summary.failed}, 跳过: ${summary.skipped}, 异常: ${summary.error}, 已发送: ${sentCount}`)
    } else {
      logger.mark(`[报告] 定时报告任务执行完成 - 总数: ${summary.total}, 成功: ${summary.success}, 失败: ${summary.failed}, 跳过: ${summary.skipped}, 异常: ${summary.error}`)
    }
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
   * 发送报告到指定群
   * @param {number} groupId - 群号
   * @param {string} date - 报告日期 (YYYY-MM-DD)
   * @param {Object} options - 额外选项
   * @param {Object} options.report - 可选的报告数据（避免重复从 Redis 获取）
   * @param {string} options.groupName - 可选的群名
   * @returns {Object} { success: boolean, error?: string }
   */
  async sendReportToGroup(groupId, date, options = {}) {
    try {
      const messageCollector = await getMessageCollector()
      const aiService = await getAIService()

      if (!messageCollector) {
        return { success: false, error: 'collector_not_ready' }
      }

      // 获取报告数据
      let report = options.report
      if (!report) {
        report = await messageCollector.redisHelper.getReport(groupId, date)
        logger.debug(`[报告发送] 从 Redis 获取群 ${groupId} 的报告数据`)
      }

      if (!report) {
        logger.warn(`[报告发送] 群 ${groupId} ${date} 报告不存在，跳过发送`)
        return { success: false, error: 'report_not_found' }
      }

      // 验证报告数据的群 ID 是否匹配
      if (report.groupId && report.groupId !== groupId) {
        logger.error(`[报告发送] 数据不匹配！期望群 ${groupId}，但获取到群 ${report.groupId} 的报告`)
        return { success: false, error: 'report_mismatch' }
      }

      logger.debug(`[报告发送] 群 ${groupId} 报告数据验证通过，消息数: ${report.stats?.basic?.totalMessages || 'unknown'}`)

      // 使用 Bot.pickGroup 自动选择正确的适配器
      // 这个方法会遍历所有 Bot 找到包含该群的 Bot
      const group = Bot.pickGroup?.(groupId)
      if (!group) {
        logger.error(`[报告发送] 无法获取群 ${groupId} 对象（可能没有 Bot 在该群）`)
        return { success: false, error: 'group_not_found' }
      }

      // 获取群名
      let groupName = options.groupName || `群${groupId}`
      if (!options.groupName) {
        try {
          const groupInfo = await group.getInfo?.()
          groupName = groupInfo?.group_name || groupInfo?.name || groupName
        } catch (err) {
          logger.debug(`[报告发送] 获取群 ${groupId} 名称失败，使用默认名称`)
        }
      }

      // 渲染报告
      const img = await this.renderReport(report, {
        groupName,
        model: aiService?.model || '',
        tokenUsage: report.tokenUsage,
        date
      })

      if (!img) {
        logger.error(`[报告发送] 群 ${groupId} ${date} 报告渲染失败`)
        return { success: false, error: 'render_failed' }
      }

      // 发送到群
      try {
        await group.sendMsg(img)
        logger.info(`[报告发送] 成功发送报告到群 ${groupId} (${groupName})`)
        return { success: true }
      } catch (err) {
        logger.error(`[报告发送] 发送到群 ${groupId} 失败: ${err}`)
        return { success: false, error: err.message }
      }
    } catch (err) {
      logger.error(`[报告发送] 群 ${groupId} 发送异常: ${err}`)
      return { success: false, error: err.message }
    }
  }

  /**
   * 定时任务：按配置的 cron 发送前一天的报告
   * 仅在 send.mode = 'scheduled' 时由定时任务调用
   */
  async scheduledSendReport() {
    const messageCollector = await getMessageCollector()
    if (!messageCollector) {
      logger.warn('[报告发送] 定时发送功能未就绪')
      return
    }

    const config = Config.get()
    const scheduleConfig = config?.schedule || {}
    const sendConfig = scheduleConfig.send || {}
    const whitelist = scheduleConfig.whitelist || []
    // 串行执行避免并发渲染bug
    const concurrency = 1

    // 检查是否启用
    if (!scheduleConfig.enabled || whitelist.length === 0) {
      logger.debug('[报告发送] 定时发送未启用或白名单为空，跳过')
      return
    }

    if (sendConfig.mode !== 'scheduled') {
      logger.debug('[报告发送] 发送模式不是 scheduled，跳过定时发送')
      return
    }

    // 发送前一天的报告
    const targetDate = moment().subtract(1, 'days').format('YYYY-MM-DD')
    logger.mark(`[报告发送] 开始执行定时发送任务 (目标日期: ${targetDate}, 白名单群数: ${whitelist.length})`)

    // 串行处理避免并发渲染导致的数据混淆
    const results = await this.runWithConcurrency(
      whitelist,
      async (groupId) => {
        const result = await this.sendReportToGroup(groupId, targetDate)
        return { groupId, ...result }
      },
      concurrency
    )

    // 统计结果
    const summary = {
      total: results.length,
      success: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    }

    logger.mark(`[报告发送] 定时发送任务完成 - 总数: ${summary.total}, 成功: ${summary.success}, 失败: ${summary.failed}`)
  }

  /**
   * 解析报告命令参数（群号、日期、权限）
   * @param {Object} e - 消息事件对象
   * @param {RegExp} regex - 匹配正则
   * @returns {Object|null} 解析结果，权限不足或参数错误时已自动回复并返回 null
   */
  async parseReportParams(e, regex) {
    const match = e.msg.match(regex)
    const isPrivate = !e.isGroup

    // 提取群号参数
    let specifiedGroupId = null
    let dateStr = null

    if (match) {
      // match groups: [full, 总结|报告, groupId?, dateStr?]
      // For generateReport regex: groups are at index 2 (groupId) and 3 (date)
      // For forceGenerateReport regex: groups are at index 1 (groupId) and 2 (date)
      for (let i = 1; i < match.length; i++) {
        if (!match[i]) continue
        if (/^\d{5,12}$/.test(match[i])) {
          specifiedGroupId = Number(match[i])
        } else if (/^(今天|昨天|前天|\d{4}-\d{2}-\d{2})$/.test(match[i])) {
          dateStr = match[i]
        }
      }
    }

    let targetGroupId
    let isRemote = false

    if (specifiedGroupId) {
      isRemote = !e.isGroup || specifiedGroupId !== e.group_id

      if (isRemote) {
        if (!e.isMaster) {
          await this.reply('仅主人可查看其他群的报告', true)
          return null
        }
      }

      targetGroupId = specifiedGroupId
    } else if (isPrivate) {
      await this.reply('私聊中请指定群号，例如：#群聊报告 123456789', true)
      return null
    } else {
      targetGroupId = e.group_id
    }

    const group = Bot.pickGroup?.(targetGroupId)
    if (!group) {
      await this.reply(`Bot 不在群 ${targetGroupId} 中，无法获取报告`, true)
      return null
    }

    let queryDate = moment().format('YYYY-MM-DD')
    let dateLabel = '今天'
    let isToday = true

    if (dateStr) {
      if (dateStr === '昨天') {
        queryDate = moment().subtract(1, 'days').format('YYYY-MM-DD')
        dateLabel = '昨天'
        isToday = false
      } else if (dateStr === '前天') {
        queryDate = moment().subtract(2, 'days').format('YYYY-MM-DD')
        dateLabel = '前天'
        isToday = false
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const date = moment(dateStr, 'YYYY-MM-DD', true)
        if (date.isValid()) {
          queryDate = date.format('YYYY-MM-DD')
          dateLabel = moment(queryDate).format('YYYY年MM月DD日')
          isToday = queryDate === moment().format('YYYY-MM-DD')
        } else {
          await this.reply('日期格式错误，请使用：YYYY-MM-DD（如 2024-11-01）', true)
          return null
        }
      } else if (dateStr === '今天') {
        dateLabel = '今天'
        isToday = true
      }
    }

    let groupName = `群${targetGroupId}`
    try {
      const groupInfo = await group.getInfo?.()
      groupName = groupInfo?.group_name || groupInfo?.name || groupName
    } catch (err) {
    }

    return { targetGroupId, queryDate, dateLabel, isToday, isRemote, groupName, group }
  }

  /**
   * 查询/生成群聊报告
   */
  async generateReport(e) {
    const messageCollector = await getMessageCollector()
    const aiService = await getAIService()

    if (!messageCollector) {
      return this.reply('报告功能未就绪', true)
    }

    try {
      // 解析查询参数（群号、日期、权限校验）
      const params = await this.parseReportParams(e, /群聊(?:总结|报告)\s*(\d{5,12})?\s*(今天|昨天|前天|\d{4}-\d{2}-\d{2})?/)
      if (!params) return

      const { targetGroupId, queryDate, dateLabel, isToday, isRemote, groupName } = params
      const groupHint = isRemote ? ` [${groupName}]` : ''

      // 从 Redis 获取指定日期的报告
      let report = await messageCollector.redisHelper.getReport(targetGroupId, queryDate)

      // ===== 当天报告逻辑 =====
      // 当天的报告：即使有缓存，不在冷却期也要重新生成（可能有新消息）
      if (isToday) {
        const cooldown = await this.checkCooldown(targetGroupId, false)

        // 在冷却期内且有缓存 → 直接返回缓存
        if (cooldown.inCooldown && report) {
          const elapsedMinutes = cooldown.lastGenerated?.elapsedMinutes || 0
          logger.info(`[报告] 用户 ${e.user_id} 查询群 ${targetGroupId} 的今天报告（冷却中，${elapsedMinutes}分钟前已生成）`)

          const img = await this.renderReport(report, {
            groupName,
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

        // 不在冷却期（或无缓存）→ 触发生成
        const messages = await messageCollector.getMessages(targetGroupId, 1, queryDate)

        if (messages.length === 0) {
          return this.reply('今天还没有消息，无法生成报告', true)
        }

        // 尝试获取生成锁
        if (!await this.acquireGeneratingLock(targetGroupId, queryDate)) {
          return this.reply('报告正在生成中，请稍后再试', true)
        }

        try {
          await this.reply(`正在生成今天的群聊报告${groupHint}（${messages.length}条消息），请稍候...`)

          logger.info(`[报告] 用户 ${e.user_id} 触发生成群 ${targetGroupId} (${groupName}) 的今天报告 (消息数: ${messages.length})`)

          const analysisResults = await this.performAnalysis(messages, 1, targetGroupId, queryDate)

          if (!analysisResults) {
            return this.reply('分析失败，请查看日志', true)
          }

          await messageCollector.redisHelper.saveReport(targetGroupId, queryDate, {
            stats: analysisResults.stats,
            topics: analysisResults.topics,
            goldenQuotes: analysisResults.goldenQuotes,
            userTitles: analysisResults.userTitles,
            messageCount: messages.length,
            tokenUsage: analysisResults.tokenUsage
          })

          await this.setCooldown(targetGroupId, 'user', messages.length)

          logger.mark(`[报告] 用户触发今天报告生成成功 - 群 ${targetGroupId}, 消息数: ${messages.length}`)

          const savedReport = await messageCollector.redisHelper.getReport(targetGroupId, queryDate)
          const img = await this.renderReport(savedReport || analysisResults, {
            groupName,
            model: aiService?.model || '',
            tokenUsage: (savedReport || analysisResults).tokenUsage,
            date: queryDate
          })

          if (img) {
            return this.reply(img)
          } else {
            return this.reply('报告已生成并保存，但渲染失败', true)
          }
        } finally {
          // 无论成功失败都释放锁
          await this.releaseGeneratingLock(targetGroupId, queryDate)
        }
      }

      // ===== 历史报告逻辑 =====
      // 保留期内：消息还在，可以比较差异、按需重新生成
      // 保留期外：消息已过期，只能查询已缓存的报告

      const messages = await messageCollector.getMessages(targetGroupId, 1, queryDate)
      const config = Config.get()
      const retentionDays = config?.retentionDays || 7
      const daysSinceQuery = moment().startOf('day').diff(moment(queryDate, 'YYYY-MM-DD').startOf('day'), 'days')
      const isWithinRetention = daysSinceQuery < retentionDays

      if (messages.length === 0) {
        // 消息已过期或未收集，检查是否有已缓存的报告
        if (report) {
          logger.info(`[报告] 用户 ${e.user_id} 查询群 ${targetGroupId} 的${dateLabel}报告（消息已过期，返回缓存报告）`)

          const img = await this.renderReport(report, {
            groupName,
            model: aiService?.model || '',
            tokenUsage: report.tokenUsage,
            date: queryDate
          })

          if (img) {
            return this.reply(img)
          } else {
            return this.sendTextSummary(report, dateLabel, queryDate)
          }
        }

        return this.reply(`${dateLabel}没有消息记录${isWithinRetention ? '（未收集到消息）' : '（消息已过期且无缓存报告）'}`, true)
      }

      // 消息存在（保留期内），检查缓存差异决定是否重新生成
      if (report) {
        const cachedMessageCount = report.messageCount || 0
        const currentMessageCount = messages.length
        const messageDiff = Math.abs(currentMessageCount - cachedMessageCount)

        // 消息数差异 <= 50 条 → 使用缓存（历史已定型）
        if (messageDiff <= 50) {
          logger.info(`[报告] 用户 ${e.user_id} 查询群 ${targetGroupId} 的${dateLabel}报告（缓存有效，消息差异: ${messageDiff}条）`)

          const img = await this.renderReport(report, {
            groupName,
            model: aiService?.model || '',
            tokenUsage: report.tokenUsage,
            date: queryDate
          })

          if (img) {
            return this.reply(img)
          } else {
            return this.sendTextSummary(report, dateLabel, queryDate)
          }
        }

        // 消息数差异 > 50 条 → 无视冷却，重新生成
        logger.info(`[报告] 用户 ${e.user_id} 查询群 ${targetGroupId} 的${dateLabel}报告 - 消息数差异过大 (缓存: ${cachedMessageCount}, 当前: ${currentMessageCount}, 差异: ${messageDiff})，将重新生成`)
      }

      // 无缓存或差异过大 → 生成报告
      // 历史日期不检查冷却，因为生成后即为定型报告，再次触发会直接使用缓存

      // 尝试获取生成锁
      if (!await this.acquireGeneratingLock(targetGroupId, queryDate)) {
        return this.reply('报告正在生成中，请稍后再试', true)
      }

      try {
        await this.reply(`正在生成${dateLabel}的群聊报告${groupHint}（${messages.length}条消息），请稍候...`)

        logger.info(`[报告] 用户 ${e.user_id} 触发生成群 ${targetGroupId} (${groupName}) 的${dateLabel}报告 (消息数: ${messages.length})`)

        const analysisResults = await this.performAnalysis(messages, 1, targetGroupId, queryDate)

        if (!analysisResults) {
          return this.reply('分析失败，请查看日志', true)
        }

        await messageCollector.redisHelper.saveReport(targetGroupId, queryDate, {
          stats: analysisResults.stats,
          topics: analysisResults.topics,
          goldenQuotes: analysisResults.goldenQuotes,
          userTitles: analysisResults.userTitles,
          messageCount: messages.length,
          tokenUsage: analysisResults.tokenUsage
        })

        // 历史日期不设置冷却，生成后即为定型报告，再次触发会直接使用缓存

        logger.mark(`[报告] 用户触发${dateLabel}报告生成成功 - 群 ${targetGroupId}, 消息数: ${messages.length}`)

        const savedReport = await messageCollector.redisHelper.getReport(targetGroupId, queryDate)
        const img = await this.renderReport(savedReport || analysisResults, {
          groupName,
          model: aiService?.model || '',
          tokenUsage: (savedReport || analysisResults).tokenUsage,
          date: queryDate
        })

        if (img) {
          return this.reply(img)
        } else {
          return this.reply('报告已生成并保存，但渲染失败', true)
        }
      } finally {
        // 无论成功失败都释放锁
        await this.releaseGeneratingLock(targetGroupId, queryDate)
      }
    } catch (err) {
      logger.error(`[报告] 查询报告错误: ${err}`)
      return this.reply(`查询报告失败: ${err.message}`, true)
    }
  }

  /**
   * 渲染失败时发送文本摘要
   * @param {Object} report - 报告数据
   * @param {string} dateLabel - 用于显示的日期标签
   * @param {string} queryDate - 查询日期字符串
   */
  sendTextSummary(report, dateLabel, queryDate) {
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

  /**
   * 强制生成群聊报告（主人专用，支持指定群号）
   */
  async forceGenerateReport(e) {
    const messageCollector = await getMessageCollector()
    const aiService = await getAIService()

    if (!messageCollector) {
      return this.reply('报告功能未就绪', true)
    }

    try {
      // 解析参数（群号、日期、权限校验）
      const params = await this.parseReportParams(e, /强制生成报告\s*(\d{5,12})?\s*(今天|昨天|前天|\d{4}-\d{2}-\d{2})?/)
      if (!params) return // Permission denied or invalid params, already replied

      const { targetGroupId, queryDate: targetDate, dateLabel, isRemote, groupName } = params
      const groupHint = isRemote ? ` [${groupName}]` : ''

      await this.reply(`正在强制生成${dateLabel}的群聊报告${groupHint}，请稍候...`)

      // 获取指定日期的消息（直接传入目标日期）
      const messages = await messageCollector.getMessages(targetGroupId, 1, targetDate)

      if (messages.length === 0) {
        return this.reply(`${dateLabel}还没有消息，无法生成报告`, true)
      }

      // 尝试获取生成锁（即使主人也需等待当前生成完成）
      if (!await this.acquireGeneratingLock(targetGroupId, targetDate)) {
        return this.reply('该日期的报告正在生成中，请稍后再试', true)
      }

      try {
        logger.info(`[报告] 主人 ${e.user_id} 强制生成群 ${targetGroupId} (${groupName}) 的${dateLabel}报告 (消息数: ${messages.length})`)

        // 执行分析（强制重新生成，不使用批次缓存）
        const analysisResults = await this.performAnalysis(messages, 1, targetGroupId, targetDate, { forceRegenerate: true })

        if (!analysisResults) {
          return this.reply('分析失败，请查看日志', true)
        }

        // 保存报告到 Redis（覆盖已有报告）
        await messageCollector.redisHelper.saveReport(targetGroupId, targetDate, {
          stats: analysisResults.stats,
          topics: analysisResults.topics,
          goldenQuotes: analysisResults.goldenQuotes,
          userTitles: analysisResults.userTitles,
          messageCount: messages.length,
          tokenUsage: analysisResults.tokenUsage
        })

        // 设置冷却标记（主人下次触发依然会无视冷却）
        await this.setCooldown(targetGroupId, 'master', messages.length)

        logger.mark(`[报告] 主人强制生成${dateLabel}报告成功 - 群 ${targetGroupId}, 消息数: ${messages.length}`)

        // 渲染并发送报告
        const savedReport = await messageCollector.redisHelper.getReport(targetGroupId, targetDate)
        const img = await this.renderReport(savedReport || analysisResults, {
          groupName,
          model: aiService?.model || '',
          tokenUsage: (savedReport || analysisResults).tokenUsage,
          date: targetDate
        })

        if (img) {
          return this.reply(img)
        } else {
          return this.reply('报告已生成并保存，但渲染失败', true)
        }
      } finally {
        // 无论成功失败都释放锁
        await this.releaseGeneratingLock(targetGroupId, targetDate)
      }
    } catch (err) {
      logger.error(`[报告] 强制生成报告错误: ${err}`)
      return this.reply(`生成报告失败: ${err.message}`, true)
    }
  }

  /**
   * 执行分析
   * @param {Array} messages - 消息数组
   * @param {number} days - 分析天数
   * @param {number} groupId - 群号（用于增量分析）
   * @param {string} date - 日期（用于增量分析）
   * @param {Object} options - 额外选项
   * @param {boolean} options.forceRegenerate - 是否强制重新生成（忽略批次缓存）
   */
  async performAnalysis(messages, days = 1, groupId = null, date = null, options = {}) {
    const { forceRegenerate = false } = options

    try {
      const config = Config.get()
      const [statisticsService, topicAnalyzer, goldenQuoteAnalyzer, userTitleAnalyzer] = await Promise.all([
        getStatisticsService(),
        getTopicAnalyzer(),
        getGoldenQuoteAnalyzer(),
        getUserTitleAnalyzer()
      ])
      const maxMessages = config.ai?.maxMessages || 1000
      const contextOverlap = 50 // 上下文重叠消息数

      logger.info(`[报告] 开始增强分析 (消息数: ${messages.length}${forceRegenerate ? ', 强制重新生成' : ''})`)

      // 1. 基础统计分析
      const stats = statisticsService.analyze(messages)
      logger.info(`[报告] 基础统计完成 - 参与用户: ${stats.basic.totalUsers}`)

      // 检查是否满足最小消息数阈值
      const minThreshold = config?.analysis?.min_messages_threshold || 20
      if (messages.length < minThreshold) {
        logger.warn(`[报告] 消息数 (${messages.length}) 少于阈值 (${minThreshold}), 跳过 AI 分析`)
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

          logger.info(`[报告] 消息总数: ${messages.length}, 完整批次: ${completedBatches}, 剩余: ${remainingMessages}`)

          // 获取所有批次的缓存（只使用成功的批次，忽略失败/缺失的）
          const batchCaches = []
          const failedBatches = []
          const missingBatches = []

          // 强制重新生成时，将所有批次都当作缺失批次重新分析
          if (forceRegenerate) {
            logger.info(`[报告] 强制重新生成模式，将重新分析所有 ${completedBatches} 个批次`)
            for (let i = 0; i < completedBatches; i++) {
              missingBatches.push(i)
            }
          } else {
            // 正常模式：检查缓存状态
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

                    logger.info(`[报告] 批次${i}缓存有效 - 话题: ${parsed.topics?.length || 0}, 金句: ${parsed.goldenQuotes?.length || 0}, Tokens: ${parsed.tokenUsage?.total_tokens || 0}`)
                  } else {
                    // 仅当未重试过时才加入重试列表
                    if (!parsed.retried) {
                      failedBatches.push(i)
                      logger.warn(`[报告] 批次${i}分析曾失败，将尝试重试`)
                    } else {
                      logger.warn(`[报告] 批次${i}分析曾失败且已重试过，跳过此批次`)
                    }
                  }
                } catch (err) {
                  logger.error(`[报告] 批次${i}缓存解析失败: ${err}`)
                  failedBatches.push(i)
                }
              } else {
                missingBatches.push(i)
                logger.info(`[报告] 批次${i}缓存不存在，需要补全`)
              }
            }
          }

          logger.info(`[报告] 批次状态检查: 成功=${batchCaches.length}, 失败=${failedBatches.length}, 缺失=${missingBatches.length}`)

          // 重试缺失和失败的批次
          if (missingBatches.length > 0 || failedBatches.length > 0) {
            const retryResult = await this.analyzeMissingBatches(
              messages, groupId, date,
              missingBatches, failedBatches, config
            )

            // 将成功补全的批次添加到缓存列表
            for (const successBatch of retryResult.successBatches) {
              batchCaches.push(successBatch)

              // 累加重试的 token 使用量
              if (successBatch.tokenUsage) {
                batchTokenUsage.prompt_tokens += successBatch.tokenUsage.prompt_tokens || 0
                batchTokenUsage.completion_tokens += successBatch.tokenUsage.completion_tokens || 0
                batchTokenUsage.total_tokens += successBatch.tokenUsage.total_tokens || 0
              }
            }

            if (retryResult.stillFailedBatches.length > 0) {
              logger.warn(`[报告] 批次补全后仍有 ${retryResult.stillFailedBatches.length} 个批次失败: [${retryResult.stillFailedBatches.join(', ')}]`)
            }
          }

          // 如果有任何成功的批次缓存，就使用增量分析
          if (batchCaches.length > 0) {
            useIncrementalAnalysis = true

            // 按批次索引排序以确保合并顺序正确
            batchCaches.sort((a, b) => a.batchIndex - b.batchIndex)

            // 合并所有批次的结果
            let mergedTopics = []
            let mergedQuotes = []

            for (const batch of batchCaches) {
              logger.debug(`[报告] 合并批次${batch.batchIndex} - 话题: ${batch.topics?.length || 0}, 金句: ${batch.goldenQuotes?.length || 0}`)
              mergedTopics = this.mergeTopics(mergedTopics, batch.topics || [])
              mergedQuotes = this.mergeGoldenQuotes(mergedQuotes, batch.goldenQuotes || [])
            }

            logger.info(`[报告] 已合并${batchCaches.length}/${completedBatches}个批次 - 话题: ${mergedTopics.length}, 金句: ${mergedQuotes.length}, Tokens: ${batchTokenUsage.total_tokens}`)

            // 如果有剩余消息，分析增量部分
            if (remainingMessages > 0) {
              const lastBatchEnd = completedBatches * maxMessages
              const incrementalMessages = [
                ...messages.slice(lastBatchEnd - contextOverlap, lastBatchEnd), // 上下文
                ...messages.slice(lastBatchEnd) // 增量消息
              ]

              logger.info(`[报告] 分析增量消息: ${incrementalMessages.length}条 (含${contextOverlap}条上下文)`)

              const [incrementalTopics, incrementalQuotes] = await Promise.all([
                config?.analysis?.topic?.enabled !== false && topicAnalyzer
                  ? topicAnalyzer.analyze(incrementalMessages, stats)
                      .then(result => ({ topics: result.topics, usage: result.usage }))
                      .catch(err => {
                        logger.error(`[报告] 增量话题分析失败: ${err}`)
                        return { topics: [], usage: null }
                      })
                  : Promise.resolve({ topics: [], usage: null }),

                config?.analysis?.goldenQuote?.enabled !== false && goldenQuoteAnalyzer
                  ? goldenQuoteAnalyzer.analyze(incrementalMessages, stats)
                      .then(result => ({ goldenQuotes: result.goldenQuotes, usage: result.usage }))
                      .catch(err => {
                        logger.error(`[报告] 增量金句分析失败: ${err}`)
                        return { goldenQuotes: [], usage: null }
                      })
                  : Promise.resolve({ goldenQuotes: [], usage: null })
              ])

              // 合并增量结果
              logger.debug(`[报告] 增量分析结果 - 话题: ${incrementalTopics.topics?.length || 0}, 金句: ${incrementalQuotes.goldenQuotes?.length || 0}`)
              logger.debug(`[报告] 合并前批次缓存 - 话题: ${mergedTopics.length}, 金句: ${mergedQuotes.length}`)

              topics = this.mergeTopics(mergedTopics, incrementalTopics.topics || [])
              goldenQuotes = this.mergeGoldenQuotes(mergedQuotes, incrementalQuotes.goldenQuotes || [])
              topicUsage = incrementalTopics.usage
              quoteUsage = incrementalQuotes.usage

              logger.info(`[报告] 增量合并完成 - 最终话题: ${topics.length}, 金句: ${goldenQuotes.length}`)
            } else {
              // 没有增量消息，直接使用合并的批次结果
              topics = mergedTopics
              goldenQuotes = mergedQuotes
              logger.info(`[报告] 无增量消息，使用批次缓存结果 - 话题: ${topics.length}, 金句: ${goldenQuotes.length}`)
            }
          }
        } catch (err) {
          logger.error(`[报告] 批次缓存处理失败，回退到全量分析: ${err}`)
          useIncrementalAnalysis = false
        }
      }

      // 3. 如果未使用增量分析，则执行常规全量分析
      if (!useIncrementalAnalysis) {
        // 全量分析时，如果消息数超过maxMessages，只分析最新的maxMessages条
        let messagesToAnalyze = messages
        if (messages.length > maxMessages) {
          messagesToAnalyze = messages.slice(-maxMessages)
          logger.info(`[报告] 消息数${messages.length}超过阈值，全量分析最新的${maxMessages}条消息`)
        }

        const analysisPromises = []

        // 话题分析
        if (config?.analysis?.topic?.enabled !== false && topicAnalyzer) {
          analysisPromises.push(
            topicAnalyzer.analyze(messagesToAnalyze, stats)
              .then(result => ({ type: 'topics', data: result.topics, usage: result.usage }))
              .catch(err => {
                logger.error(`[报告] 话题分析失败: ${err}`)
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
                logger.error(`[报告] 金句提取失败: ${err}`)
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
          logger.error(`[报告] 用户称号分析失败: ${err}`)
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
      logger.info(`[报告] ${analysisMode}分析完成 - 话题: ${topics.length}, 金句: ${goldenQuotes.length}, 称号: ${userTitles.length}, Tokens: ${analysisResults.tokenUsage.total_tokens}`)

      return analysisResults
    } catch (err) {
      logger.error(`[报告] 增强分析失败: ${err}`)
      return null
    }
  }

  /**
   * 渲染报告
   */
  async renderReport(analysisResults, options) {
    try {
      const config = Config.get()
      const activityVisualizer = await getActivityVisualizer()
      const { stats, topics, goldenQuotes, userTitles } = analysisResults

      // 准备活跃度图表数据
      const activityChartData = config?.analysis?.activity?.enabled !== false && activityVisualizer
        ? activityVisualizer.prepareChartData(stats.hourly)
        : null

      // 格式化日期范围
      const dateRange = stats.basic.dateRange.start === stats.basic.dateRange.end
        ? stats.basic.dateRange.start
        : `${stats.basic.dateRange.start} ~ ${stats.basic.dateRange.end}`

      // 获取渲染质量配置
      const renderConfig = config?.summary?.render || {}
      const imgType = renderConfig.imgType || 'png'
      const quality = renderConfig.quality || 100

      // 获取模板配置
      const templateName = config?.summary?.template || 'default'
      const templatePath = getSummaryTemplatePath(templateName)
      const templateDir = getSummaryTemplateDir(templateName)

      // 格式化 token 使用情况
      const tokenUsage = options.tokenUsage ? {
        prompt: options.tokenUsage.prompt_tokens || 0,
        completion: options.tokenUsage.completion_tokens || 0,
        total: options.tokenUsage.total_tokens || 0
      } : null

      const templateData = {
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

        // 链接和视频统计
        totalLinks: stats.links?.total || 0,
        linksBySource: stats.links?.bySource || {},
        totalVideos: stats.videos || 0,

        // 活跃度图表数据
        enableActivityChart: config?.analysis?.activity?.enabled !== false && activityChartData !== null,
        activityChart: activityChartData,

        // AI 分析结果
        topics,
        goldenQuotes,
        userTitles,

        // 元数据 - 使用报告数据中的 savedAt 时间戳
        createTime: analysisResults.savedAt ? moment(analysisResults.savedAt).format('YYYY-MM-DD HH:mm:ss') : moment().format('YYYY-MM-DD HH:mm:ss'),
        tokenUsage,

        // 路径配置
        pluResPath: RESOURCES_DIR + '/',
        templateDir: templateDir + '/'
      }

      // 渲染群聊总结报告
      const img = await puppeteer.screenshot('group-insight', {
        tplFile: templatePath,
        imgType,
        quality,
        ...templateData
      })

      return img
    } catch (err) {
      logger.error(`[报告] 渲染增强总结失败: ${err}`)
      return null
    }
  }

  /**
   * 分析缺失/失败的批次并保存到缓存
   * 用于报告生成时的批次补全
   * @param {Array} messages - 目标日期的所有消息
   * @param {number} groupId - 群号
   * @param {string} date - 目标日期 (YYYY-MM-DD)
   * @param {Array} missingBatches - 缺失的批次索引数组
   * @param {Array} failedBatches - 失败的批次索引数组
   * @param {Object} config - 配置对象
   * @returns {Object} { successBatches: [], stillFailedBatches: [], tokenUsage: {} }
   */
  async analyzeMissingBatches(messages, groupId, date, missingBatches, failedBatches, config) {
    const maxMessages = config.ai?.maxMessages || 1000
    const contextOverlap = 50
    const batchesToRetry = [...missingBatches, ...failedBatches].sort((a, b) => a - b)

    const results = {
      successBatches: [],
      stillFailedBatches: [],
      tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    }

    if (batchesToRetry.length === 0) {
      return results
    }

    // 获取分析器
    const [topicAnalyzer, goldenQuoteAnalyzer] = await Promise.all([
      getTopicAnalyzer(),
      getGoldenQuoteAnalyzer()
    ])

    logger.info(`[报告] 开始补全 ${batchesToRetry.length} 个批次: [${batchesToRetry.join(', ')}]`)

    // 顺序处理批次，避免 API 过载
    for (const batchIndex of batchesToRetry) {
      try {
        const startIndex = batchIndex * maxMessages
        const endIndex = (batchIndex + 1) * maxMessages
        const contextStart = Math.max(0, startIndex - contextOverlap)
        const messagesToAnalyze = messages.slice(contextStart, endIndex)

        if (messagesToAnalyze.length === 0) {
          logger.warn(`[报告] 批次${batchIndex}消息为空，跳过`)
          continue
        }

        const actualContextCount = startIndex - contextStart
        logger.info(`[报告] 补全批次${batchIndex}: 分析 [${contextStart}-${Math.min(messages.length, endIndex)}] 共 ${messagesToAnalyze.length} 条 (含${actualContextCount}条上下文)`)

        // 构建轻量级用户映射用于统计
        const userMap = new Map()
        for (const msg of messagesToAnalyze) {
          if (msg.user_id && msg.nickname && !userMap.has(msg.nickname)) {
            userMap.set(msg.nickname, { user_id: msg.user_id, nickname: msg.nickname })
          }
        }
        const stats = { users: Array.from(userMap.values()) }

        // 并行分析话题和金句
        const [topicResult, quoteResult] = await Promise.all([
          topicAnalyzer?.analyze(messagesToAnalyze, stats).catch(err => {
            logger.error(`[报告] 批次${batchIndex}话题分析失败: ${err}`)
            return { topics: [], usage: null }
          }),
          goldenQuoteAnalyzer?.analyze(messagesToAnalyze, stats).catch(err => {
            logger.error(`[报告] 批次${batchIndex}金句分析失败: ${err}`)
            return { goldenQuotes: [], usage: null }
          })
        ])

        // 计算本批次的 token 使用量
        const batchTokenUsage = {
          prompt_tokens: (topicResult?.usage?.prompt_tokens || 0) + (quoteResult?.usage?.prompt_tokens || 0),
          completion_tokens: (topicResult?.usage?.completion_tokens || 0) + (quoteResult?.usage?.completion_tokens || 0),
          total_tokens: (topicResult?.usage?.total_tokens || 0) + (quoteResult?.usage?.total_tokens || 0)
        }

        // 保存到缓存
        const cacheKey = `Yz:groupManager:batch:${groupId}:${date}:${batchIndex}`
        const cacheData = {
          batchIndex,
          startIndex,
          endIndex,
          messageCount: messagesToAnalyze.length,
          topics: topicResult?.topics || [],
          goldenQuotes: quoteResult?.goldenQuotes || [],
          tokenUsage: batchTokenUsage,
          analyzedAt: Date.now(),
          success: true,
          retried: true  // 标记为重试/补全的批次
        }

        await redis.set(cacheKey, JSON.stringify(cacheData), 'EX', 86400)

        results.successBatches.push(cacheData)
        results.tokenUsage.prompt_tokens += batchTokenUsage.prompt_tokens
        results.tokenUsage.completion_tokens += batchTokenUsage.completion_tokens
        results.tokenUsage.total_tokens += batchTokenUsage.total_tokens

        logger.info(`[报告] 批次${batchIndex}补全成功 - 话题: ${cacheData.topics.length}, 金句: ${cacheData.goldenQuotes.length}, Tokens: ${batchTokenUsage.total_tokens}`)

      } catch (err) {
        logger.error(`[报告] 批次${batchIndex}补全失败: ${err}`)

        // 保存失败标记，防止本次会话重复尝试
        const cacheKey = `Yz:groupManager:batch:${groupId}:${date}:${batchIndex}`
        try {
          await redis.set(cacheKey, JSON.stringify({
            batchIndex,
            success: false,
            error: err.message,
            analyzedAt: Date.now(),
            retried: true
          }), 'EX', 86400)
        } catch (cacheErr) {
          logger.error(`[报告] 保存批次${batchIndex}失败标记失败: ${cacheErr}`)
        }

        results.stillFailedBatches.push(batchIndex)
      }
    }

    const successCount = results.successBatches.length
    const failCount = results.stillFailedBatches.length
    logger.info(`[报告] 批次补全完成 - 成功: ${successCount}, 失败: ${failCount}, 总Token: ${results.tokenUsage.total_tokens}`)

    return results
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
