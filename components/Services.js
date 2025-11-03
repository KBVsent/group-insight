/**
 * 共享服务管理
 * 确保所有服务实例在全局只初始化一次
 */
import MessageCollector from '../services/messageCollector.js'
import WordCloudGenerator from '../services/wordCloudGenerator.js'
import AIService from '../services/aiService.js'
import StatisticsService from '../services/StatisticsService.js'
import ActivityVisualizer from '../services/ActivityVisualizer.js'
import TopicAnalyzer from '../services/analyzers/TopicAnalyzer.js'
import GoldenQuoteAnalyzer from '../services/analyzers/GoldenQuoteAnalyzer.js'
import UserTitleAnalyzer from '../services/analyzers/UserTitleAnalyzer.js'
import Config from './Config.js'

// 单例服务实例
let messageCollector = null
let wordCloudGenerator = null
let aiService = null
let statisticsService = null
let activityVisualizer = null
let topicAnalyzer = null
let goldenQuoteAnalyzer = null
let userTitleAnalyzer = null

/**
 * 获取消息收集器实例
 */
export function getMessageCollector() {
  if (!messageCollector) {
    const config = Config.get()
    if (config?.messageCollection?.enabled !== false) {
      messageCollector = new MessageCollector(config)
      messageCollector.startCollecting()
      logger.info('[群聊助手] 消息收集器已启动')
    }
  }
  return messageCollector
}

/**
 * 获取词云生成器实例
 */
export function getWordCloudGenerator() {
  if (!wordCloudGenerator) {
    const config = Config.get()
    wordCloudGenerator = new WordCloudGenerator(config)
  }
  return wordCloudGenerator
}

/**
 * 获取 AI 服务实例
 */
export function getAIService() {
  if (!aiService) {
    const config = Config.get()
    if (config?.ai?.enabled) {
      try {
        aiService = new AIService(config)
        logger.info('[群聊助手] AI 服务已初始化')
      } catch (err) {
        logger.warn('[群聊助手] AI 服务初始化失败:', err.message)
      }
    }
  }
  return aiService
}

/**
 * 获取统计服务实例
 */
export function getStatisticsService() {
  if (!statisticsService) {
    const config = Config.get()
    const statsConfig = {
      night_start_hour: config?.statistics?.night_start_hour || 0,
      night_end_hour: config?.statistics?.night_end_hour || 6
    }
    statisticsService = new StatisticsService(statsConfig)
  }
  return statisticsService
}

/**
 * 获取活动可视化器实例
 */
export function getActivityVisualizer() {
  if (!activityVisualizer) {
    const config = Config.get()
    activityVisualizer = new ActivityVisualizer(config?.analysis?.activity || {})
  }
  return activityVisualizer
}

/**
 * 获取话题分析器实例
 */
export function getTopicAnalyzer() {
  if (!topicAnalyzer) {
    const config = Config.get()
    const aiSvc = getAIService()
    const analysisConfig = {
      llm_timeout: config?.ai?.llm_timeout || 100,
      llm_retries: config?.ai?.llm_retries || 2,
      llm_backoff: config?.ai?.llm_backoff || 2,
      ...config?.analysis?.topic,
      min_messages_threshold: config?.analysis?.min_messages_threshold || 20
    }
    topicAnalyzer = new TopicAnalyzer(aiSvc, analysisConfig)
  }
  return topicAnalyzer
}

/**
 * 获取金句分析器实例
 */
export function getGoldenQuoteAnalyzer() {
  if (!goldenQuoteAnalyzer) {
    const config = Config.get()
    const aiSvc = getAIService()
    const analysisConfig = {
      llm_timeout: config?.ai?.llm_timeout || 100,
      llm_retries: config?.ai?.llm_retries || 2,
      llm_backoff: config?.ai?.llm_backoff || 2,
      ...config?.analysis?.goldenQuote,
      min_messages_threshold: config?.analysis?.min_messages_threshold || 20
    }
    goldenQuoteAnalyzer = new GoldenQuoteAnalyzer(aiSvc, analysisConfig)
  }
  return goldenQuoteAnalyzer
}

/**
 * 获取用户称号分析器实例
 */
export function getUserTitleAnalyzer() {
  if (!userTitleAnalyzer) {
    const config = Config.get()
    const aiSvc = getAIService()
    const analysisConfig = {
      llm_timeout: config?.ai?.llm_timeout || 100,
      llm_retries: config?.ai?.llm_retries || 2,
      llm_backoff: config?.ai?.llm_backoff || 2,
      ...config?.analysis?.userTitle,
      min_messages_threshold: config?.analysis?.min_messages_threshold || 20
    }
    userTitleAnalyzer = new UserTitleAnalyzer(aiSvc, analysisConfig)
  }
  return userTitleAnalyzer
}

/**
 * 重新初始化所有服务（配置变更时调用）
 */
export async function reinitializeServices(newConfig) {
  logger.info('[群聊助手] 正在重新初始化服务...')

  // 停止消息收集器
  if (messageCollector) {
    messageCollector.stopCollecting()
    messageCollector = null
  }

  // 重置所有服务
  wordCloudGenerator = null
  aiService = null
  statisticsService = null
  activityVisualizer = null
  topicAnalyzer = null
  goldenQuoteAnalyzer = null
  userTitleAnalyzer = null

  // 重新初始化消息收集器
  if (newConfig.messageCollection?.enabled !== false) {
    messageCollector = new MessageCollector(newConfig)
    messageCollector.startCollecting()
    logger.info('[群聊助手] 消息收集器已重新启动')
  }

  logger.info('[群聊助手] 服务重新初始化完成')
}

/**
 * 停止所有服务
 */
export function stopAllServices() {
  if (messageCollector) {
    messageCollector.stopCollecting()
    messageCollector = null
  }
  wordCloudGenerator = null
  aiService = null
  statisticsService = null
  activityVisualizer = null
  topicAnalyzer = null
  goldenQuoteAnalyzer = null
  userTitleAnalyzer = null
  logger.info('[群聊助手] 所有服务已停止')
}
