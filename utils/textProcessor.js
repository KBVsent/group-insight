/**
 * 文本处理工具类
 * 提供分词、过滤停用词、统计词频等功能
 */

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default class TextProcessor {
  constructor() {
    this.jieba = null
    this.stopwords = new Set()
    this.initialized = false
  }

  /**
   * 初始化分词器和停用词
   */
  async init() {
    if (this.initialized) return

    try {
      // 动态导入 nodejieba（需要先安装）
      const nodejieba = await import('nodejieba')
      this.jieba = nodejieba.default || nodejieba

      // 加载停用词
      const stopwordsPath = join(__dirname, '../config/stopwords.json')
      const stopwordsData = fs.readFileSync(stopwordsPath, 'utf8')
      const stopwords = JSON.parse(stopwordsData)
      this.stopwords = new Set(stopwords)

      this.initialized = true
      logger.info('[群聊助手] 文本处理器初始化成功')
    } catch (err) {
      logger.error(`[群聊助手] 文本处理器初始化失败: ${err}`)
      logger.warn('[群聊助手] 请运行: cd plugins/group-insight && pnpm install')
      this.initialized = false
    }
  }

  /**
   * 清理消息文本
   * 移除 @、表情、图片占位符、命令前缀等
   * @param {string} text - 原始文本
   */
  cleanText(text) {
    if (!text) return ''

    return text
      // 移除 @ 提及
      .replace(/@[^\s]+/g, '')
      // 移除 QQ 表情和图片占位符 [xxx]
      .replace(/\[.*?\]/g, '')
      // 移除命令前缀
      .replace(/^[#\/]/g, '')
      // 移除多余空格
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * 对文本进行分词
   * @param {string} text - 文本
   * @param {number} minLength - 最小词长度
   */
  cut(text, minLength = 2) {
    if (!this.initialized || !this.jieba) {
      // 如果未初始化，使用简单的字符分割
      logger.warn('[群聊助手] 分词器未初始化，使用简单分词')
      return this.simpleCut(text, minLength)
    }

    try {
      const words = this.jieba.cut(text)
      return words.filter(word => {
        // 过滤长度不足的词
        if (word.length < minLength) return false
        // 过滤停用词
        if (this.stopwords.has(word)) return false
        // 只保留中文词汇
        if (!/[\u4e00-\u9fa5]/.test(word)) return false
        return true
      })
    } catch (err) {
      logger.error(`[群聊助手] 分词失败: ${err}`)
      return this.simpleCut(text, minLength)
    }
  }

  /**
   * 简单分词（降级方案）
   * 当 nodejieba 不可用时使用
   */
  simpleCut(text, minLength = 2) {
    // 提取所有中文词汇
    const words = []
    let currentWord = ''

    for (const char of text) {
      if (/[\u4e00-\u9fa5]/.test(char)) {
        currentWord += char
      } else {
        if (currentWord.length >= minLength && !this.stopwords.has(currentWord)) {
          words.push(currentWord)
        }
        currentWord = ''
      }
    }

    if (currentWord.length >= minLength && !this.stopwords.has(currentWord)) {
      words.push(currentWord)
    }

    return words
  }

  /**
   * 统计词频
   * @param {array} words - 词汇数组
   * @param {number} minFrequency - 最小词频
   */
  countWords(words, minFrequency = 2) {
    const wordCount = new Map()

    for (const word of words) {
      wordCount.set(word, (wordCount.get(word) || 0) + 1)
    }

    // 过滤低频词
    const result = []
    for (const [word, count] of wordCount.entries()) {
      if (count >= minFrequency) {
        result.push({ word, count })
      }
    }

    // 按词频排序
    return result.sort((a, b) => b.count - a.count)
  }

  /**
   * 处理消息列表并返回词频统计
   * @param {array} messages - 消息列表
   * @param {object} options - 选项
   */
  async processMessages(messages, options = {}) {
    const {
      minLength = 2,
      minFrequency = 2,
      maxWords = 100
    } = options

    // 确保已初始化
    await this.init()

    // 提取所有消息文本
    const allWords = []

    for (const msg of messages) {
      const cleanedText = this.cleanText(msg.message || msg.msg || '')
      if (!cleanedText) continue

      const words = this.cut(cleanedText, minLength)
      allWords.push(...words)
    }

    // 统计词频
    const wordCount = this.countWords(allWords, minFrequency)

    // 限制返回数量
    return wordCount.slice(0, maxWords)
  }

  /**
   * 格式化消息用于 AI 总结
   * @param {array} messages - 消息列表
   * @param {number} maxMessages - 最大消息数
   */
  formatForAI(messages, maxMessages = 500) {
    const formatted = []

    for (let i = 0; i < Math.min(messages.length, maxMessages); i++) {
      const msg = messages[i]
      const text = this.cleanText(msg.message || msg.msg || '')

      if (text) {
        formatted.push({
          user: msg.nickname || msg.name || '匿名',
          time: msg.time,
          content: text
        })
      }
    }

    return formatted
  }
}
