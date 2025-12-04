/**
 * 文本处理工具类
 * 提供分词、过滤停用词、统计词频、TF-IDF 关键词提取等功能
 */

import fs from 'fs'
import Config from '../components/Config.js'
import { STOPWORDS_PATH, USERDICT_PATH } from '#paths'

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
      // 动态导入 jieba-wasm
      const jiebaWasm = await import('jieba-wasm')
      const { cut, tag, add_word, with_dict } = jiebaWasm

      // 创建 API 适配器包装器
      this.jieba = {
        cut: (text) => cut(text, true),  // 第二个参数为 true 启用 HMM 模式
        tag: (text) => tag(text, true),  // 词性标注功能
        add_word,                         // 添加单个词
        with_dict                         // 批量加载自定义词典
      }

      // 加载配置
      this.config = Config.get()

      // 加载自定义词典
      this.loadUserDict()

      // 加载过滤词
      this.loadStopwords()

      this.initialized = true
      logger.debug('[群聊洞见] 文本处理器初始化成功 (jieba-wasm + 词性标注)')
    } catch (err) {
      logger.error(`[群聊洞见] 文本处理器初始化失败: ${err}`)
      logger.warn('[群聊洞见] 请运行: cd plugins/group-insight && pnpm install')
      this.initialized = false
    }
  }

  /**
   * 加载自定义词典
   * 让分词器正确识别特定词汇
   */
  loadUserDict() {
    if (!fs.existsSync(USERDICT_PATH)) {
      logger.debug(`[群聊洞见] 自定义词典文件不存在: ${USERDICT_PATH}`)
      return
    }

    try {
      const dictContent = fs.readFileSync(USERDICT_PATH, 'utf8')
      // 过滤空行和注释行
      const cleanContent = dictContent
        .split('\n')
        .filter(line => line.trim() && !line.trim().startsWith('#'))
        .join('\n')

      if (cleanContent) {
        this.jieba.with_dict(cleanContent)
        const wordCount = cleanContent.split('\n').length
        logger.info(`[群聊洞见] 已加载自定义词典 (${wordCount} 词)`)
      }
    } catch (err) {
      logger.warn(`[群聊洞见] 加载自定义词典失败: ${err}`)
    }
  }

  /**
   * 加载过滤词
   * 这些词不会出现在词云中
   */
  loadStopwords() {
    if (!fs.existsSync(STOPWORDS_PATH)) {
      logger.debug(`[群聊洞见] 过滤词文件不存在: ${STOPWORDS_PATH}`)
      return
    }

    try {
      const content = fs.readFileSync(STOPWORDS_PATH, 'utf8')
      const words = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))

      this.stopwords = new Set(words)
      logger.info(`[群聊洞见] 已加载过滤词 (${this.stopwords.size} 词)`)
    } catch (err) {
      logger.warn(`[群聊洞见] 加载过滤词失败: ${err}`)
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
      maxWords = 100,
      extractMethod = this.config?.wordCloud?.extractMethod || 'frequency'
    } = options

    // 确保已初始化
    await this.init()

    // 如果配置为 TF-IDF 模式，使用 TF-IDF 提取
    if (extractMethod === 'tfidf') {
      return this.processMessagesTFIDF(messages, { minLength, maxWords })
    }

    // 默认：词频统计模式
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
   * 使用 TF-IDF 算法处理消息并提取关键词
   * 将同一用户的消息聚合为一个文档，计算跨用户的 TF-IDF 权重
   * @param {array} messages - 消息列表
   * @param {object} options - 选项
   * @returns {Array<{word: string, weight: number}>} 关键词及其权重
   */
  async processMessagesTFIDF(messages, options = {}) {
    const {
      minLength = 2,
      maxWords = 100
    } = options

    // 确保已初始化
    await this.init()

    // 步骤1：按用户聚合消息（每个用户 = 一个文档）
    const userDocs = new Map()  // userId -> words[]

    for (const msg of messages) {
      const userId = msg.user_id || msg.sender?.user_id || 'unknown'
      const cleanedText = this.cleanText(msg.message || msg.msg || '')
      if (!cleanedText) continue

      const words = this.cut(cleanedText, minLength)
      if (words.length === 0) continue

      if (!userDocs.has(userId)) {
        userDocs.set(userId, [])
      }
      userDocs.get(userId).push(...words)
    }

    // 转换为文档数组
    const docsWords = Array.from(userDocs.values()).filter(words => words.length > 0)

    if (docsWords.length === 0) {
      return []
    }

    // 步骤2：计算 TF-IDF
    const keywords = this.calculateTFIDF(docsWords, maxWords)

    logger.debug(`[群聊洞见] TF-IDF 提取完成，用户数: ${docsWords.length}，关键词数: ${keywords.length}`)

    return keywords
  }

  /**
   * TF-IDF 算法实现
   * @param {string[][]} docsWords - 分词后的文档数组（每个文档是词汇数组）
   * @param {number} topK - 返回前 K 个关键词
   * @returns {Array<{word: string, weight: number}>} 关键词及其 TF-IDF 权重（归一化到 0-1）
   */
  calculateTFIDF(docsWords, topK = 100) {
    if (!docsWords || docsWords.length === 0) {
      return []
    }

    const docCount = docsWords.length

    // 步骤1：计算文档频率（DF）- 每个词在多少文档中出现
    const wordDocFreq = new Map()

    for (const words of docsWords) {
      const uniqueWords = new Set(words)
      for (const word of uniqueWords) {
        wordDocFreq.set(word, (wordDocFreq.get(word) || 0) + 1)
      }
    }

    // 步骤2：计算每个词在所有文档中的 TF-IDF 累计值
    const wordTFIDF = new Map()

    for (const words of docsWords) {
      if (words.length === 0) continue

      // 计算当前文档的词频（TF）
      const tf = new Map()
      for (const word of words) {
        tf.set(word, (tf.get(word) || 0) + 1)
      }

      // 按文档长度归一化 TF
      const docLength = words.length

      // 计算 TF-IDF 并累加
      for (const [word, freq] of tf) {
        const df = wordDocFreq.get(word)
        // 平滑 IDF: log((N + 1) / (DF + 1)) + 1
        // 防止除零并避免极端值
        const idf = Math.log((docCount + 1) / (df + 1)) + 1

        // 归一化 TF
        const normalizedTF = freq / docLength

        const tfidf = normalizedTF * idf

        // 累加各文档的 TF-IDF 分数
        wordTFIDF.set(word, (wordTFIDF.get(word) || 0) + tfidf)
      }
    }

    // 步骤3：按 TF-IDF 分数排序并返回前 K 个
    const sortedWords = Array.from(wordTFIDF.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)

    // 归一化权重到 0-1 范围
    const maxWeight = sortedWords.length > 0 ? sortedWords[0][1] : 1

    return sortedWords.map(([word, weight]) => ({
      word,
      weight: weight / maxWeight
    }))
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
