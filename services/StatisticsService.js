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

    // 初始化统计容器
    const userMap = new Map()
    const hourlyCount = new Array(24).fill(0)
    const emojiStats = {
      face: 0,
      mface: 0,
      emoji: 0,
      total: 0
    }
    // 链接和视频统计
    const linkStats = {
      total: 0,
      bySource: new Map()  // source -> count
    }
    let totalVideos = 0

    let totalChars = 0
    let totalEmojis = 0
    let totalReplies = 0
    const timestamps = []

    // 单次遍历完成所有统计
    for (const msg of messages) {
      const userId = msg.user_id
      const hour = msg.hour !== undefined ? msg.hour : new Date(msg.time * 1000).getHours()
      const msgLength = msg.length || msg.message?.length || 0

      // 基础统计
      totalChars += msgLength
      timestamps.push(msg.time * 1000)

      if (msg.hasReply) {
        totalReplies++
      }

      // 表情统计（faces 格式：{ face: [], mface: [], emoji: [], total: 0 }）
      if (msg.faces && msg.faces.total !== undefined) {
        totalEmojis += msg.faces.total
        emojiStats.face += msg.faces.face?.length || 0
        emojiStats.mface += msg.faces.mface?.length || 0
        if (Array.isArray(msg.faces.emoji)) {
          emojiStats.emoji += msg.faces.emoji.reduce((sum, count) => sum + count, 0)
        }
        emojiStats.total += msg.faces.total
      }

      // 链接分享统计（小程序、分享卡片等）
      if (msg.links && msg.links.length > 0) {
        linkStats.total += msg.links.length
        for (const link of msg.links) {
          const source = link.source || '未知来源'
          linkStats.bySource.set(source, (linkStats.bySource.get(source) || 0) + 1)
        }
      }

      // 视频统计
      if (msg.videos && msg.videos.length > 0) {
        totalVideos += msg.videos.length
      }

      // 小时分布统计
      hourlyCount[hour]++

      // 用户统计
      if (!userMap.has(userId)) {
        userMap.set(userId, {
          user_id: userId,
          nickname: msg.nickname,
          messageCount: 0,
          charCount: 0,
          emojiCount: 0,
          replyCount: 0,
          nightCount: 0,
          linkCount: 0,
          videoCount: 0,
          hourlyDistribution: new Array(24).fill(0)
        })
      }

      const userStat = userMap.get(userId)
      userStat.messageCount++
      userStat.charCount += msgLength
      userStat.hourlyDistribution[hour]++

      // 用户表情统计
      if (msg.faces && msg.faces.total !== undefined) {
        userStat.emojiCount += msg.faces.total
      }

      // 用户回复统计
      if (msg.hasReply) {
        userStat.replyCount++
      }

      // 用户链接分享统计
      if (msg.links && msg.links.length > 0) {
        userStat.linkCount += msg.links.length
      }

      // 用户视频统计
      if (msg.videos && msg.videos.length > 0) {
        userStat.videoCount += msg.videos.length
      }

      // 用户夜间活跃度
      if (this.isNightHour(hour)) {
        userStat.nightCount++
      }
    }

    // 计算基础统计的派生值
    const minTime = Math.min(...timestamps)
    const maxTime = Math.max(...timestamps)
    const basicStats = {
      totalMessages: messages.length,
      totalUsers: userMap.size,
      totalChars,
      totalEmojis,
      totalReplies,
      replyRatio: messages.length > 0 ? (totalReplies / messages.length) : 0,
      avgCharsPerMsg: messages.length > 0 ? (totalChars / messages.length).toFixed(1) : 0,
      dateRange: {
        start: new Date(minTime).toLocaleDateString('zh-CN'),
        end: new Date(maxTime).toLocaleDateString('zh-CN')
      }
    }

    // 计算用户统计的派生值
    const userStats = []
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
      const totalShares = (userStat.linkCount || 0) + (userStat.videoCount || 0)
      userStat.shareRatio = userStat.messageCount > 0
        ? (totalShares / userStat.messageCount).toFixed(2)
        : 0
      userStat.mostActiveHour = this.findPeakHour(userStat.hourlyDistribution)
      userStats.push(userStat)
    }

    // 计算小时分布统计的派生值
    const peakHour = this.findPeakHour(hourlyCount)
    const peakCount = hourlyCount[peakHour]
    const hourlyActivity = hourlyCount.map(count => {
      if (count === 0) return 'none'
      const ratio = count / peakCount
      if (ratio >= 0.7) return 'high'
      if (ratio >= 0.4) return 'medium'
      return 'low'
    })

    const hourlyStats = {
      hourlyCount,
      hourlyActivity,
      peakHour,
      peakCount,
      peakPeriod: this.getHourRange(peakHour)
    }

    // 转换链接统计的 Map 为对象
    const linkStatsOutput = {
      total: linkStats.total,
      bySource: Object.fromEntries(linkStats.bySource)
    }

    return {
      basic: basicStats,
      users: userStats,
      hourly: hourlyStats,
      emoji: emojiStats,
      links: linkStatsOutput,
      videos: totalVideos,
      topUsers: this.rankUsers(userStats)
    }
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
      links: {
        total: 0,
        bySource: {}
      },
      videos: 0,
      topUsers: []
    }
  }
}
