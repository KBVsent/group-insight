/**
 * 文本处理工具类
 * 提供分词、过滤停用词、统计词频等功能
 */

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'
import Config from '../components/Config.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default class TextProcessor {
  constructor() {
    this.jieba = null
    this.stopwords = new Set()
    this.initialized = false
    this.config = null
  }

  /**
   * 初始化分词器和停用词
   */
  async init() {
    if (this.initialized) return

    try {
      // 动态导入 jieba-wasm（需要先安装）
      const jiebaWasm = await import('jieba-wasm')
      const { cut, tag } = jiebaWasm

      // 创建 API 适配器包装器,确保与原 nodejieba API 兼容
      this.jieba = {
        cut: (text) => cut(text, true),  // 第二个参数为 true 启用 HMM 模式,提高分词准确度
        tag: (text) => tag(text, true)   // 词性标注功能
      }

      // 加载停用词
      const stopwordsPath = join(__dirname, '../config/stopwords.json')
      const stopwordsData = fs.readFileSync(stopwordsPath, 'utf8')
      const stopwords = JSON.parse(stopwordsData)
      this.stopwords = new Set(stopwords)

      // 加载配置
      this.config = Config.get()

      this.initialized = true
      logger.debug('[群聊洞见] 文本处理器初始化成功 (jieba-wasm + 词性标注)')
    } catch (err) {
      logger.error(`[群聊洞见] 文本处理器初始化失败: ${err}`)
      logger.warn('[群聊洞见] 请运行: cd plugins/group-insight && pnpm install')
      this.initialized = false
    }
  }

  /**
   * 根据配置获取要过滤的词性列表
   * jieba 词性标注说明：
   * u - 助词（的、了、着、过、等）
   * y - 语气词（啊、吗、呢、吧、呀）
   * d - 副词（很、太、非常、都、就）
   * c - 连词（和、与、或、但是、因为）
   * r - 代词（我、你、他、这、那）
   * q - 量词（个、些、点、下、次）
   * t - 时间词（现在、今天、刚才、马上）
   * f - 方位词（上、下、里、外、中）
   * m - 数词（一、二、三、几、多）
   * @returns {Set} 要过滤的词性集合
   */
  getFilterPOSList() {
    const filterStrength = this.config?.wordCloud?.filterStrength || 'standard'

    // 词性过滤规则
    const posRules = {
      // 宽松模式：仅过滤助词和语气词
      loose: new Set(['u', 'y']),

      // 标准模式：+ 副词、连词、代词（推荐）
      standard: new Set(['u', 'y', 'd', 'c', 'r']),

      // 严格模式：+ 量词、时间词、方位词、数词
      strict: new Set(['u', 'y', 'd', 'c', 'r', 'q', 't', 'f', 'm'])
    }

    return posRules[filterStrength] || posRules.standard
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
      logger.warn('[群聊洞见] 分词器未初始化，使用简单分词')
      return this.simpleCut(text, minLength)
    }

    try {
      // 使用词性标注进行分词（返回 [{word, tag}, ...] 格式）
      const taggedWords = this.jieba.tag(text)
      const filterPOS = this.getFilterPOSList()

      // 过滤规则（四层过滤）
      return taggedWords
        .filter(({ word, tag }) => {
          // 1. 过滤长度不足的词
          if (word.length < minLength) return false

          // 2. 过滤停用词（保留原有机制）
          if (this.stopwords.has(word)) return false

          // 3. 只保留中文词汇
          if (!/[\u4e00-\u9fa5]/.test(word)) return false

          // 4. 基于词性过滤（新增）
          if (filterPOS.has(tag)) return false

          return true
        })
        .map(({ word }) => word) // 仅返回词汇，去除词性标签
    } catch (err) {
      logger.error(`[群聊洞见] 分词失败: ${err}`)
      return this.simpleCut(text, minLength)
    }
  }

  /**
   * 简单分词（降级方案）
   * 当 jieba-wasm 不可用时使用
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
