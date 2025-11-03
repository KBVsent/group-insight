/**
 * 活跃度可视化服务
 * 生成 24 小时活跃度热力图 HTML
 */

export default class ActivityVisualizer {
  constructor(config = {}) {
    this.config = config
  }

  /**
   * 生成活跃度图表 HTML
   * @param {Object} hourlyStats - 小时统计数据 (来自 StatisticsService)
   * @returns {string} HTML 字符串
   */
  generateChart(hourlyStats) {
    if (!hourlyStats || !hourlyStats.hourlyCount) {
      return this.generateEmptyChart()
    }

    const { hourlyCount, peakHour, peakCount } = hourlyStats

    // 生成每个小时的柱状图
    const bars = hourlyCount
      .map((count, hour) => {
        // 计算高度百分比（基于峰值）
        const heightPercent = peakCount > 0 ? (count / peakCount) * 100 : 0

        // 根据活跃度设置颜色
        const color = this.getActivityColor(count, peakCount)

        // 是否是峰值时段
        const isPeak = hour === peakHour

        return `
        <div class="activity-hour ${isPeak ? 'peak' : ''}">
          <div class="activity-bar-container">
            <div class="activity-bar" style="height: ${heightPercent}%; background: ${color}; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
              ${count > 0 ? `<span class="activity-count">${count}</span>` : ''}
            </div>
          </div>
          <div class="activity-label">${hour}</div>
        </div>`
      })
      .join('')

    return `
    <div class="activity-chart">
      <div class="activity-chart-title">
        <span>📈 24小时活跃度分布</span>
        <span class="peak-indicator">峰值: ${peakHour}:00-${(peakHour + 1) % 24}:00 (${peakCount}条)</span>
      </div>
      <div class="activity-chart-container">
        <div class="activity-bars">
          ${bars}
        </div>
      </div>
      <div class="activity-legend">
        <div class="legend-item">
          <span class="legend-color" style="background: #ef4444;"></span>
          <span>高活跃</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #f59e0b;"></span>
          <span>中活跃</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #10b981;"></span>
          <span>低活跃</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #6b7280;"></span>
          <span>无消息</span>
        </div>
      </div>
    </div>`
  }

  /**
   * 计算Y轴刻度
   * @param {number} peakCount - 峰值消息数
   * @returns {Object} 刻度信息 { interval: 刻度间隔, max: 最大值, scales: 刻度数组 }
   */
  calculateYAxisScale(peakCount) {
    if (peakCount === 0) {
      return { interval: 10, max: 50, scales: [0, 10, 20, 30, 40, 50] }
    }

    // 根据峰值选择合适的刻度间隔
    let interval
    if (peakCount <= 20) {
      interval = 5
    } else if (peakCount <= 50) {
      interval = 10
    } else if (peakCount <= 100) {
      interval = 20
    } else if (peakCount <= 200) {
      interval = 50
    } else if (peakCount <= 500) {
      interval = 100
    } else {
      // 对于更大的值，向上取整到100的倍数
      interval = Math.ceil(peakCount / 5 / 100) * 100
    }

    // 计算最大刻度（向上取整到刻度间隔的倍数）
    const max = Math.ceil(peakCount / interval) * interval

    // 生成刻度数组
    const scales = []
    for (let i = 0; i <= max; i += interval) {
      scales.push(i)
    }

    return { interval, max, scales }
  }

  /**
   * 根据活跃度计算颜色
   * @param {number} count - 当前小时消息数
   * @param {number} peakCount - 峰值消息数
   * @returns {string} 颜色代码
   */
  getActivityColor(count, peakCount) {
    if (count === 0) return '#6b7280'  // 灰色 - 无消息

    const ratio = count / peakCount

    if (ratio >= 0.7) {
      // 高活跃: 红色
      return '#ef4444'
    } else if (ratio >= 0.4) {
      // 中活跃: 橙色
      return '#f59e0b'
    } else {
      // 低活跃: 绿色
      return '#10b981'
    }
  }

  /**
   * 生成空图表
   */
  generateEmptyChart() {
    return `
    <div class="activity-chart">
      <div class="activity-chart-title">
        <span>📈 24小时活跃度分布</span>
      </div>
      <div class="activity-empty">
        <p>暂无数据</p>
      </div>
    </div>`
  }

  /**
   * 生成 CSS 样式
   * @returns {string} CSS 字符串
   */
  static getStyles() {
    return `
    .activity-chart {
      margin: 20px 0;
      padding: 15px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .activity-chart-title {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      color: white;
      font-size: 16px;
      font-weight: bold;
    }

    .peak-indicator {
      font-size: 12px;
      background: rgba(255, 255, 255, 0.2);
      padding: 4px 10px;
      border-radius: 20px;
    }

    .activity-chart-container {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      height: 150px;
      margin-bottom: 10px;
      padding: 10px 5px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 8px;
    }

    .activity-hour {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      padding: 0 1px;
    }

    .activity-bar-container {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }

    .activity-bar {
      width: 90%;
      min-height: 2px;
      border-radius: 4px 4px 0 0;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      transition: all 0.3s ease;
      position: relative;
    }

    .activity-bar:hover {
      opacity: 0.8;
      transform: scaleY(1.05);
    }

    .activity-count {
      font-size: 9px;
      color: white;
      font-weight: bold;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
      padding: 2px 0;
    }

    .activity-hour.peak .activity-bar {
      box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
      border: 2px solid rgba(255, 255, 255, 0.8);
    }

    .activity-label {
      margin-top: 5px;
      font-size: 10px;
      color: rgba(255, 255, 255, 0.9);
      font-weight: 500;
    }

    .activity-legend {
      display: flex;
      justify-content: center;
      gap: 15px;
      margin-top: 10px;
      flex-wrap: wrap;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.9);
    }

    .legend-color {
      width: 12px;
      height: 12px;
      border-radius: 3px;
      display: inline-block;
    }

    .activity-empty {
      text-align: center;
      padding: 40px;
      color: rgba(255, 255, 255, 0.7);
      font-size: 14px;
    }

    /* 移动端适配 */
    @media (max-width: 768px) {
      .activity-chart-title {
        flex-direction: column;
        gap: 8px;
        text-align: center;
      }

      .activity-count {
        font-size: 8px;
      }

      .activity-label {
        font-size: 8px;
      }

      .legend-item {
        font-size: 10px;
      }
    }`
  }
}
