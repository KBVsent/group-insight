/**
 * 词云生成器
 * 使用 Puppeteer 渲染 HTML 模板生成词云图片
 */

import moment from 'moment'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import TextProcessor from '../utils/textProcessor.js'
import { WORDCLOUD_TEMPLATE_PATH, PLUGIN_ROOT } from '#paths'

export default class WordCloudGenerator {
  constructor(config) {
    this.config = config || {}
    this.textProcessor = new TextProcessor()
  }

  /**
   * 生成词云图片
   * @param {array} messages - 消息列表
   * @param {object} options - 选项
   */
  async generate(messages, options = {}) {
    const {
      groupId = 'Unknown',
      groupName = '未知群聊',
      days = 1,
      maxWords = this.config.maxWords || 100,
      minLength = this.config.minLength || 2,
      minFrequency = this.config.minFrequency || 2,
      width = this.config.width || 1200,
      height = this.config.height || 800,
      backgroundColor = this.config.backgroundColor || '#ffffff'
    } = options

    // 获取渲染质量配置
    const renderConfig = this.config.render || {}
    const imgType = renderConfig.imgType || 'png'
    const quality = renderConfig.quality || 100

    try {
      // 处理消息并生成词频统计
      logger.info(`[群聊洞见] 开始生成词云，消息数: ${messages.length}`)

      const wordCount = await this.textProcessor.processMessages(messages, {
        minLength,
        minFrequency,
        maxWords
      })

      if (wordCount.length === 0) {
        logger.warn('[群聊洞见] 没有足够的词汇生成词云')
        return null
      }

      logger.info(`[群聊洞见] 统计到 ${wordCount.length} 个词汇`)

      // 归一化词频到固定范围 (1-10)，确保词云大小可控
      const frequencies = wordCount.map(item => item.count)
      const maxFreq = Math.max(...frequencies)
      const minFreq = Math.min(...frequencies)
      const freqRange = maxFreq - minFreq

      logger.info(`[群聊洞见] 频率范围: ${minFreq} - ${maxFreq}`)

      // 准备词云数据（wordcloud2.js 格式：[词, 相对倍率]）
      // 使用对数缩放将真实频率映射到 1-10 范围
      const wordList = wordCount.map(item => {
        let normalizedWeight
        if (freqRange === 0) {
          // 所有词频率相同，使用固定权重
          normalizedWeight = 5
        } else {
          // 对数缩放: log(freq) 映射到 1-10
          // 使用自然对数压缩差异，让高频词和低频词的大小差异更合理
          const logFreq = Math.log(item.count)
          const logMin = Math.log(minFreq)
          const logMax = Math.log(maxFreq)
          const logRange = logMax - logMin

          // 映射到 1-10 范围
          normalizedWeight = 1 + ((logFreq - logMin) / logRange) * 9
        }

        return [item.word, normalizedWeight]
      })

      // 准备模板数据
      const templateData = {
        groupName,
        timeRange: this.getTimeRangeText(days),
        messageCount: messages.length,
        createTime: moment().format('YYYY-MM-DD HH:mm:ss'),
        wordListJson: JSON.stringify(wordList),
        width,
        height,
        backgroundColor,
        pluResPath: PLUGIN_ROOT + '/resources/'
      }

      // 渲染模板（使用高质量参数）
      const img = await puppeteer.screenshot('group-insight-wordcloud', {
        tplFile: WORDCLOUD_TEMPLATE_PATH,
        imgType,
        quality,
        ...templateData
      })

      logger.info('[群聊洞见] 词云生成成功')
      return img
    } catch (err) {
      logger.error(`[群聊洞见] 词云生成失败: ${err}`)
      logger.error(err.stack)
      return null
    }
  }

  /**
   * 获取时间范围文本
   * @param {number} days - 天数
   */
  getTimeRangeText(days) {
    switch (days) {
      case 1:
        return '当天'
      case 3:
        return '近三天'
      case 7:
        return '近七天'
      default:
        return `近${days}天`
    }
  }

  /**
   * 获取热词榜（纯文本）
   * @param {array} messages - 消息列表
   * @param {number} topN - 前 N 个词
   */
  async getTopWords(messages, topN = 10) {
    const wordCount = await this.textProcessor.processMessages(messages, {
      minLength: 2,
      minFrequency: 2,
      maxWords: topN
    })

    return wordCount.slice(0, topN)
  }
}
