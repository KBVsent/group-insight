/**
 * 共享服务管理
 * 使用 ServiceManager 确保优雅的服务生命周期管理
 */
import { ServiceManager, SingletonServiceManager } from './ServiceManager.js'
import MessageCollector from '../services/messageCollector.js'
import WordCloudGenerator from '../services/wordCloudGenerator.js'
import AIService from '../services/aiService.js'
import StatisticsService from '../services/StatisticsService.js'
import ActivityVisualizer from '../services/ActivityVisualizer.js'
import TopicAnalyzer from '../services/analyzers/TopicAnalyzer.js'
import GoldenQuoteAnalyzer from '../services/analyzers/GoldenQuoteAnalyzer.js'
import UserTitleAnalyzer from '../services/analyzers/UserTitleAnalyzer.js'
import Config from './Config.js'

/**
 * MessageCollector 服务管理器
 */
class MessageCollectorManager extends ServiceManager {
  async _doInitialize() {
    const config = Config.get()
    if (config?.messageCollection?.enabled === false) {
      logger.info('[群聊洞见] 消息收集已禁用')
      return null
    }

    const collector = new MessageCollector(config)
    collector.startCollecting()
    return collector
  }

  async stop() {
    if (this.instance) {
      this.instance.stopCollecting()
    }
    await super.stop()
  }
}

/**
 * AI 服务管理器
 */
class AIServiceManager extends ServiceManager {
  async _doInitialize() {
    const config = Config.get()
    const aiConfig = config?.ai

    // 检查是否启用
    const isAIEnabled = aiConfig && aiConfig.apiKey && aiConfig.apiKey.trim() !== ''
    if (!isAIEnabled) {
      logger.info('[群聊洞见] AI 服务未启用 (未配置 API Key)')
      return null
    }

    // 创建并初始化 AI 服务
    const service = new AIService(aiConfig)
    await service.init()
    return service
  }
}

/**
 * WordCloudGenerator 服务管理器
 */
class WordCloudGeneratorManager extends ServiceManager {
  async _doInitialize() {
    const config = Config.get()
    return new WordCloudGenerator(config)
  }
}

/**
 * StatisticsService 服务管理器
 */
class StatisticsServiceManager extends ServiceManager {
  async _doInitialize() {
    const config = Config.get()
    const statsConfig = {
      night_start_hour: config?.statistics?.night_start_hour || 0,
      night_end_hour: config?.statistics?.night_end_hour || 6
    }
    return new StatisticsService(statsConfig)
  }
}

/**
 * ActivityVisualizer 服务管理器
 */
class ActivityVisualizerManager extends ServiceManager {
  async _doInitialize() {
    const config = Config.get()
    return new ActivityVisualizer(config?.analysis?.activity || {})
  }
}

/**
 * 创建分析器管理器类的工厂函数
 */
function createAnalyzerManagerClass(AnalyzerClass, configKey) {
  return class extends ServiceManager {
    async _doInitialize() {
      // 获取 AI 服务管理器（从单例获取）
      const aiServiceManager = SingletonServiceManager.getManager('AIService', AIServiceManager)

      // 获取 AI 服务
      const aiService = await aiServiceManager.getInstance()
      if (!aiService) {
        // AI 服务不可用，返回 null（会被标记为 DISABLED）
        logger.debug(`[${this.name}] AI 服务不可用，分析器无法初始化`)
        return null
      }

      // 获取配置
      const config = Config.get()
      const analysisConfig = {
        llm_timeout: config?.ai?.llm_timeout || 100,
        llm_retries: config?.ai?.llm_retries || 2,
        llm_backoff: config?.ai?.llm_backoff || 2,
        ...config?.analysis?.[configKey],
        min_messages_threshold: config?.analysis?.min_messages_threshold || 20
      }

      return new AnalyzerClass(aiService, analysisConfig)
    }
  }
}

// 创建服务管理器单例
const messageCollectorManager = SingletonServiceManager.getManager('MessageCollector', MessageCollectorManager)
const aiServiceManager = SingletonServiceManager.getManager('AIService', AIServiceManager)
const wordCloudGeneratorManager = SingletonServiceManager.getManager('WordCloudGenerator', WordCloudGeneratorManager)
const statisticsServiceManager = SingletonServiceManager.getManager('StatisticsService', StatisticsServiceManager)
const activityVisualizerManager = SingletonServiceManager.getManager('ActivityVisualizer', ActivityVisualizerManager)

// 创建分析器管理器单例
const topicAnalyzerManager = SingletonServiceManager.getManager(
  'TopicAnalyzer',
  createAnalyzerManagerClass(TopicAnalyzer, 'topic')
)

const goldenQuoteAnalyzerManager = SingletonServiceManager.getManager(
  'GoldenQuoteAnalyzer',
  createAnalyzerManagerClass(GoldenQuoteAnalyzer, 'goldenQuote')
)

const userTitleAnalyzerManager = SingletonServiceManager.getManager(
  'UserTitleAnalyzer',
  createAnalyzerManagerClass(UserTitleAnalyzer, 'userTitle')
)

/**
 * 获取消息收集器实例
 * @returns {Promise<MessageCollector|null>}
 */
export async function getMessageCollector() {
  return await messageCollectorManager.getInstance()
}

/**
 * 获取词云生成器实例
 * @returns {Promise<WordCloudGenerator|null>}
 */
export async function getWordCloudGenerator() {
  return await wordCloudGeneratorManager.getInstance()
}

/**
 * 获取 AI 服务实例
 * @returns {Promise<AIService|null>}
 */
export async function getAIService() {
  return await aiServiceManager.getInstance()
}

/**
 * 获取统计服务实例
 * @returns {Promise<StatisticsService|null>}
 */
export async function getStatisticsService() {
  return await statisticsServiceManager.getInstance()
}

/**
 * 获取活动可视化器实例
 * @returns {Promise<ActivityVisualizer|null>}
 */
export async function getActivityVisualizer() {
  return await activityVisualizerManager.getInstance()
}

/**
 * 获取话题分析器实例
 * @returns {Promise<TopicAnalyzer|null>}
 */
export async function getTopicAnalyzer() {
  try {
    return await topicAnalyzerManager.getInstance()
  } catch (error) {
    logger.debug(`[群聊洞见] 话题分析器不可用: ${error.message}`)
    return null
  }
}

/**
 * 获取金句分析器实例
 * @returns {Promise<GoldenQuoteAnalyzer|null>}
 */
export async function getGoldenQuoteAnalyzer() {
  try {
    return await goldenQuoteAnalyzerManager.getInstance()
  } catch (error) {
    logger.debug(`[群聊洞见] 金句分析器不可用: ${error.message}`)
    return null
  }
}

/**
 * 获取用户称号分析器实例
 * @returns {Promise<UserTitleAnalyzer|null>}
 */
export async function getUserTitleAnalyzer() {
  try {
    return await userTitleAnalyzerManager.getInstance()
  } catch (error) {
    logger.debug(`[群聊洞见] 用户称号分析器不可用: ${error.message}`)
    return null
  }
}

/**
 * 重新初始化所有服务（配置变更时调用）
 */
export async function reinitializeServices(newConfig) {
  logger.info('[群聊洞见] 正在重新初始化服务...')

  // 重置所有单例服务（包括分析器）
  await SingletonServiceManager.resetAll()

  // 立即启动消息收集器（如果启用）
  if (newConfig?.messageCollection?.enabled !== false) {
    await getMessageCollector()
  }

  logger.info('[群聊洞见] 服务重新初始化完成')
}

/**
 * 停止所有服务
 */
export async function stopAllServices() {
  logger.info('[群聊洞见] 正在停止所有服务...')

  // 停止所有单例服务（包括分析器）
  await SingletonServiceManager.stopAll()

  logger.info('[群聊洞见] 所有服务已停止')
}

/**
 * 获取所有服务状态
 * @returns {Object} 服务状态信息
 */
export function getServicesStatus() {
  // SingletonServiceManager 现在包含所有服务，包括分析器
  return SingletonServiceManager.getStatus()
}

// 兼容性：提供同步包装函数，便于渐进式迁移
// 这些函数会立即返回实例或null，不会等待初始化
let syncCompatibilityWarned = false

/**
 * 同步获取消息收集器（兼容旧代码）
 * @deprecated 请使用异步版本 getMessageCollector()
 */
export function getMessageCollectorSync() {
  if (!syncCompatibilityWarned) {
    logger.warn('[群聊洞见] 使用了同步获取服务的方法，建议改用异步版本')
    syncCompatibilityWarned = true
  }
  // 如果服务已经就绪，直接返回
  if (messageCollectorManager.state === 'ready') {
    return messageCollectorManager.instance
  }
  // 触发异步初始化，但不等待
  messageCollectorManager.getInstance().catch(() => {})
  return null
}

/**
 * 同步获取 AI 服务（兼容旧代码）
 * @deprecated 请使用异步版本 getAIService()
 */
export function getAIServiceSync() {
  if (aiServiceManager.state === 'ready') {
    return aiServiceManager.instance
  }
  aiServiceManager.getInstance().catch(() => {})
  return null
}