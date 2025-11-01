/**
 * 词云生成器
 * 使用 Puppeteer 渲染 HTML 模板生成词云图片
 */

import moment from 'moment'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import TextProcessor from '../utils/textProcessor.js'

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

    try {
      // 处理消息并生成词频统计
      logger.info(`[群聊管理] 开始生成词云，消息数: ${messages.length}`)

      const wordCount = await this.textProcessor.processMessages(messages, {
        minLength,
        minFrequency,
        maxWords
      })

      if (wordCount.length === 0) {
        logger.warn('[群聊管理] 没有足够的词汇生成词云')
        return null
      }

      logger.info(`[群聊管理] 统计到 ${wordCount.length} 个词汇`)

      // 准备词云数据（wordcloud2.js 格式：[词, 权重]）
      const wordList = wordCount.map(item => [item.word, item.count])

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
        pluResPath: `${process.cwd()}/plugins/group-manager/resources/`
      }

      // 渲染模板
      const img = await puppeteer.screenshot('group-manager-wordcloud', {
        tplFile: `${process.cwd()}/plugins/group-manager/resources/wordcloud/index.html`,
        ...templateData
      })

      logger.info('[群聊管理] 词云生成成功')
      return img
    } catch (err) {
      logger.error(`[群聊管理] 词云生成失败: ${err}`)
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
