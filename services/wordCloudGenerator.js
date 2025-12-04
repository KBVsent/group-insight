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
      extractMethod = this.config.extractMethod || 'frequency',
      width = this.config.width || 1200,
      height = this.config.height || 800,
      backgroundColor = this.config.backgroundColor || '#ffffff'
    } = options

    // 获取渲染质量配置
    const renderConfig = this.config.render || {}
    const imgType = renderConfig.imgType || 'png'
    const quality = renderConfig.quality || 100

    try {
      // 处理消息并生成词频统计或 TF-IDF 关键词
      logger.info(`[群聊洞见] 开始生成词云，消息数: ${messages.length}，提取方式: ${extractMethod}`)

      const wordData = await this.textProcessor.processMessages(messages, {
        minLength,
        minFrequency,
        maxWords,
        extractMethod
      })

      if (wordData.length === 0) {
        logger.warn('[群聊洞见] 没有足够的词汇生成词云')
        return null
      }

      logger.info(`[群聊洞见] 统计到 ${wordData.length} 个词汇`)

      // 根据提取方式准备词云数据
      let wordList

      if (extractMethod === 'tfidf') {
        // TF-IDF 模式：wordData 格式为 [{word, weight}, ...]，weight 范围 0-1
        // 缩放到 1-10 范围供 wordcloud2.js 使用
        wordList = wordData.map(item => {
          const scaledWeight = 1 + item.weight * 9  // 映射 0-1 到 1-10
          return [item.word, scaledWeight]
        })
        logger.debug(`[群聊洞见] TF-IDF 权重范围: ${wordData[wordData.length - 1]?.weight?.toFixed(4) || 0} - ${wordData[0]?.weight?.toFixed(4) || 1}`)
      } else {
        // 词频模式：wordData 格式为 [{word, count}, ...]
        // 使用对数缩放归一化
        const frequencies = wordData.map(item => item.count)
        const maxFreq = Math.max(...frequencies)
        const minFreq = Math.min(...frequencies)
        const freqRange = maxFreq - minFreq

        logger.info(`[群聊洞见] 频率范围: ${minFreq} - ${maxFreq}`)

        wordList = wordData.map(item => {
          let normalizedWeight
          if (freqRange === 0) {
            normalizedWeight = 5
          } else {
            const logFreq = Math.log(item.count)
            const logMin = Math.log(minFreq)
            const logMax = Math.log(maxFreq)
            const logRange = logMax - logMin
            normalizedWeight = 1 + ((logFreq - logMin) / logRange) * 9
          }
          return [item.word, normalizedWeight]
        })
      }

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
