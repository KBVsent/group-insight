/**
 * 活跃度可视化服务
 * 生成 24 小时活跃度热力图 HTML
 */

export default class ActivityVisualizer {
  constructor(config = {}) {
    this.config = config
  }

  /**
   * 准备活跃度图表数据 
   * @param {Object} hourlyStats - 小时统计数据 (来自 StatisticsService)
   * @returns {Object|null} 图表数据对象或 null
   */
  prepareChartData(hourlyStats) {
    if (!hourlyStats || !hourlyStats.hourlyCount) {
      return null
    }

    const { hourlyCount, peakHour, peakCount } = hourlyStats

    // 准备每个小时的数据
    const hours = hourlyCount.map((count, hour) => {
      // 计算高度百分比（基于峰值）
      const heightPercent = peakCount > 0 ? (count / peakCount) * 100 : 0

      // 计算活跃度比例
      const activityRatio = peakCount > 0 ? count / peakCount : 0

      // 计算活跃度等级
      let activityLevel = 'none'
      if (count > 0) {
        if (activityRatio >= 0.7) {
          activityLevel = 'high'
        } else if (activityRatio >= 0.4) {
          activityLevel = 'medium'
        } else {
          activityLevel = 'low'
        }
      }

      // 是否是峰值时段
      const isPeak = hour === peakHour

      return {
        hour,
        count,
        heightPercent,
        activityLevel,  // 'none', 'low', 'medium', 'high'
        activityRatio,  // 0-1 的比例值
        isPeak
      }
    })

    return {
      hours,
      peakHour,
      peakCount,
      peakNextHour: (peakHour + 1) % 24
    }
  }
}
