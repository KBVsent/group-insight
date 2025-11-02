/**
 * 话题分析器
 * 从群聊消息中提取主要讨论话题
 */

import BaseAnalyzer from './BaseAnalyzer.js'

export default class TopicAnalyzer extends BaseAnalyzer {
  constructor(aiService, config = {}) {
    super(aiService, config)
    this.maxTopics = config.max_topics || 5
  }

  /**
   * 执行话题分析
   * @param {Array} messages - 消息列表
   * @param {Object} stats - 统计信息 (可选)
   * @returns {Promise<Array>} 话题列表
   */
  async analyze(messages, stats = null) {
    if (!messages || messages.length === 0) {
      logger.warn('[TopicAnalyzer] 消息列表为空')
      return []
    }

    // 格式化消息
    const formattedMessages = this.formatMessages(messages, {
      includeTime: true,
      includeNickname: true,
      maxLength: 15000  // 限制提示词长度
    })

    // 构建提示词
    const prompt = this.buildPrompt(formattedMessages)

    // 调用 AI
    const result = await this.callAI(prompt, 2000, 0.7)

    if (!result || !result.content) {
      logger.error('[TopicAnalyzer] AI 调用失败')
      return []
    }

    // 解析 JSON 响应
    const topics = this.parseJSON(result.content)

    if (!Array.isArray(topics)) {
      logger.error('[TopicAnalyzer] 返回格式错误,期望数组')
      return []
    }

    // 验证和清理数据
    const validTopics = topics
      .filter(topic => topic && topic.topic && topic.detail)
      .map(topic => ({
        topic: topic.topic.trim(),
        contributors: Array.isArray(topic.contributors)
          ? topic.contributors.slice(0, 5)
          : [],
        detail: topic.detail.trim()
      }))
      .slice(0, this.maxTopics)

    logger.info(`[TopicAnalyzer] 提取到 ${validTopics.length} 个话题`)

    return validTopics
  }

  /**
   * 构建 AI 提示词
   * @param {string} formattedMessages - 格式化后的消息
   */
  buildPrompt(formattedMessages) {
    return `你是一个帮我进行群聊信息总结的助手,生成总结内容时,你需要严格遵守下面的几个准则:

请分析接下来提供的群聊记录,提取出最多 ${this.maxTopics} 个主要话题。

对于每个话题,请提供:
1. 话题名称 (突出主题内容,尽量简明扼要,控制在 10 字以内)
2. 主要参与者 (最多 5 人,按参与度排序)
3. 话题详细描述 (包含关键信息和结论)

注意事项:
- 对于比较有价值的点,稍微用一两句话详细讲讲,让读者能了解讨论的深度
- 对于其中的部分信息,你需要特意提到主题施加的主体是谁,即明确指出"谁做了什么"
- 对于每一条总结,尽量讲清楚前因后果,不要只列出结论
- 如果某个话题有明确的结论或共识,请在描述中体现
- 忽略无意义的闲聊、灌水、单纯的表情回复等
- 优先选择讨论深度较深、参与人数较多的话题
- 如果消息太少或没有明确话题,可以返回空数组 []

群聊记录格式: [HH:MM] 昵称: 消息内容

群聊记录:
${formattedMessages}

---

请以标准 JSON 数组格式返回,不要包含任何其他文字说明:
[
  {
    "topic": "话题名称",
    "contributors": ["参与者1", "参与者2", "参与者3"],
    "detail": "话题的详细描述,包含讨论内容、关键信息和结论。"
  },
  {
    "topic": "另一个话题",
    "contributors": ["参与者4", "参与者5"],
    "detail": "另一个话题的详细描述..."
  }
]`
  }
}
