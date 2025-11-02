/**
 * 统计分析服务
 * 从消息列表中计算各种统计指标
 */

export default class StatisticsService {
  constructor(config = {}) {
    this.config = config
    // 夜间时段配置 (默认 0:00-6:00)
    this.nightStartHour = config.night_start_hour || 0
    this.nightEndHour = config.night_end_hour || 6
  }

  /**
   * 分析消息列表,生成完整统计报告
   * @param {Array} messages - 消息列表
   * @returns {Object} 统计结果
   */
  analyze(messages) {
    if (!messages || messages.length === 0) {
      return this.getEmptyStats()
    }

    // 基础统计
    const basicStats = this.calculateBasicStats(messages)

    // 用户统计
    const userStats = this.calculateUserStats(messages)

    // 小时分布统计
    const hourlyStats = this.calculateHourlyStats(messages)

    // 表情统计
    const emojiStats = this.calculateEmojiStats(messages)

    return {
      basic: basicStats,
      users: userStats,
      hourly: hourlyStats,
      emoji: emojiStats,
      topUsers: this.rankUsers(userStats)
    }
  }

  /**
   * 计算基础统计信息
   * @param {Array} messages - 消息列表
   */
  calculateBasicStats(messages) {
    const uniqueUsers = new Set()
    let totalChars = 0
    let totalEmojis = 0
    let totalReplies = 0

    for (const msg of messages) {
      uniqueUsers.add(msg.user_id)
      totalChars += msg.length || msg.message?.length || 0

      // 统计表情
      if (msg.faces) {
        if (typeof msg.faces === 'object' && msg.faces.total !== undefined) {
          totalEmojis += msg.faces.total
        } else if (Array.isArray(msg.faces)) {
          totalEmojis += msg.faces.length
        }
      }

      // 统计回复消息
      if (msg.hasReply) {
        totalReplies++
      }
    }

    // 计算日期范围
    const timestamps = messages.map(m => m.timestamp || m.time * 1000)
    const minTime = Math.min(...timestamps)
    const maxTime = Math.max(...timestamps)
    const dateRange = {
      start: new Date(minTime).toLocaleDateString('zh-CN'),
      end: new Date(maxTime).toLocaleDateString('zh-CN')
    }

    return {
      totalMessages: messages.length,
      totalUsers: uniqueUsers.size,
      totalChars,
      totalEmojis,
      totalReplies,
      replyRatio: messages.length > 0 ? (totalReplies / messages.length) : 0,
      avgCharsPerMsg: messages.length > 0 ? (totalChars / messages.length).toFixed(1) : 0,
      dateRange
    }
  }

  /**
   * 计算用户级别统计
   * @param {Array} messages - 消息列表
   */
  calculateUserStats(messages) {
    const userMap = new Map()

    for (const msg of messages) {
      const userId = msg.user_id

      if (!userMap.has(userId)) {
        userMap.set(userId, {
          user_id: userId,
          nickname: msg.nickname,
          messageCount: 0,
          charCount: 0,
          emojiCount: 0,
          replyCount: 0,
          nightCount: 0,  // 夜间消息数
          hourlyDistribution: new Array(24).fill(0)  // 24小时分布
        })
      }

      const userStat = userMap.get(userId)
      userStat.messageCount++
      userStat.charCount += msg.length || msg.message?.length || 0

      // 表情统计
      if (msg.faces) {
        if (typeof msg.faces === 'object' && msg.faces.total !== undefined) {
          userStat.emojiCount += msg.faces.total
        } else if (Array.isArray(msg.faces)) {
          userStat.emojiCount += msg.faces.length
        }
      }

      // 回复统计
      if (msg.hasReply) {
        userStat.replyCount++
      }

      // 小时分布
      const hour = msg.hour !== undefined ? msg.hour : new Date(msg.time * 1000).getHours()
      userStat.hourlyDistribution[hour]++

      // 夜间活跃度
      if (this.isNightHour(hour)) {
        userStat.nightCount++
      }
    }

    // 计算比率和平均值
    for (const userStat of userMap.values()) {
      userStat.avgLength = userStat.messageCount > 0
        ? (userStat.charCount / userStat.messageCount).toFixed(1)
        : 0
      userStat.emojiRatio = userStat.messageCount > 0
        ? (userStat.emojiCount / userStat.messageCount).toFixed(2)
        : 0
      userStat.replyRatio = userStat.messageCount > 0
        ? (userStat.replyCount / userStat.messageCount).toFixed(2)
        : 0
      userStat.nightRatio = userStat.messageCount > 0
        ? (userStat.nightCount / userStat.messageCount).toFixed(2)
        : 0

      // 找出最活跃的时段
      userStat.mostActiveHour = this.findPeakHour(userStat.hourlyDistribution)
    }

    return Array.from(userMap.values())
  }

  /**
   * 计算小时分布统计
   * @param {Array} messages - 消息列表
   */
  calculateHourlyStats(messages) {
    const hourlyCount = new Array(24).fill(0)

    for (const msg of messages) {
      const hour = msg.hour !== undefined ? msg.hour : new Date(msg.time * 1000).getHours()
      hourlyCount[hour]++
    }

    // 找出峰值时段
    const peakHour = this.findPeakHour(hourlyCount)
    const peakCount = hourlyCount[peakHour]

    // 计算活跃度等级
    const hourlyActivity = hourlyCount.map(count => {
      if (count === 0) return 'none'
      const ratio = count / peakCount
      if (ratio >= 0.7) return 'high'
      if (ratio >= 0.4) return 'medium'
      return 'low'
    })

    return {
      hourlyCount,
      hourlyActivity,
      peakHour,
      peakCount,
      peakPeriod: this.getHourRange(peakHour)
    }
  }

  /**
   * 计算表情统计
   * @param {Array} messages - 消息列表
   */
  calculateEmojiStats(messages) {
    const stats = {
      face: 0,      // 普通表情数
      mface: 0,     // 动画表情数
      emoji: 0,     // Emoji 数
      total: 0      // 总表情数
    }

    for (const msg of messages) {
      if (!msg.faces) continue

      if (typeof msg.faces === 'object' && !Array.isArray(msg.faces)) {
        // 新格式（适配 Yunzai 实际消息结构）
        stats.face += msg.faces.face?.length || 0
        stats.mface += msg.faces.mface?.length || 0

        // Emoji 统计（emoji 字段是数组，每个元素是该条消息的 emoji 数量）
        if (Array.isArray(msg.faces.emoji)) {
          stats.emoji += msg.faces.emoji.reduce((sum, count) => sum + count, 0)
        }

        stats.total += msg.faces.total || 0
      } else if (Array.isArray(msg.faces)) {
        // 旧格式兼容 (只有 face)
        stats.face += msg.faces.length
        stats.total += msg.faces.length
      }
    }

    return stats
  }

  /**
   * 对用户按消息数排序
   * @param {Array} userStats - 用户统计列表
   */
  rankUsers(userStats) {
    return [...userStats]
      .sort((a, b) => b.messageCount - a.messageCount)
      .map((user, index) => ({
        ...user,
        rank: index + 1
      }))
  }

  /**
   * 判断是否是夜间时段
   * @param {number} hour - 小时 (0-23)
   */
  isNightHour(hour) {
    return hour >= this.nightStartHour && hour < this.nightEndHour
  }

  /**
   * 找出峰值小时
   * @param {Array} hourlyCount - 24小时计数数组
   */
  findPeakHour(hourlyCount) {
    let maxCount = 0
    let peakHour = 0

    for (let i = 0; i < hourlyCount.length; i++) {
      if (hourlyCount[i] > maxCount) {
        maxCount = hourlyCount[i]
        peakHour = i
      }
    }

    return peakHour
  }

  /**
   * 获取小时范围描述
   * @param {number} hour - 小时
   */
  getHourRange(hour) {
    const nextHour = (hour + 1) % 24
    return `${hour.toString().padStart(2, '0')}:00-${nextHour.toString().padStart(2, '0')}:00`
  }

  /**
   * 获取空统计结果
   */
  getEmptyStats() {
    return {
      basic: {
        totalMessages: 0,
        totalUsers: 0,
        totalChars: 0,
        totalEmojis: 0,
        totalReplies: 0,
        replyRatio: 0,
        avgCharsPerMsg: 0,
        dateRange: { start: '', end: '' }
      },
      users: [],
      hourly: {
        hourlyCount: new Array(24).fill(0),
        hourlyActivity: new Array(24).fill('none'),
        peakHour: 0,
        peakCount: 0,
        peakPeriod: '00:00-01:00'
      },
      emoji: {
        face: 0,
        mface: 0,
        bface: 0,
        sface: 0,
        animated: 0,
        total: 0
      },
      topUsers: []
    }
  }

  /**
   * 格式化用户统计为可读文本
   * @param {Object} userStat - 用户统计对象
   */
  formatUserStat(userStat) {
    return {
      昵称: userStat.nickname,
      消息数: userStat.messageCount,
      字数: userStat.charCount,
      平均长度: userStat.avgLength,
      表情数: userStat.emojiCount,
      表情率: `${(parseFloat(userStat.emojiRatio) * 100).toFixed(0)}%`,
      回复率: `${(parseFloat(userStat.replyRatio) * 100).toFixed(0)}%`,
      夜猫子率: `${(parseFloat(userStat.nightRatio) * 100).toFixed(0)}%`,
      最活跃时段: this.getHourRange(userStat.mostActiveHour)
    }
  }
}
