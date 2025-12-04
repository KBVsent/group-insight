/**
 * 用户称号分析器
 * 基于用户行为模式分配创意称号和 MBTI 类型
 */

import BaseAnalyzer from './BaseAnalyzer.js'
import { logger } from '#lib'

export default class UserTitleAnalyzer extends BaseAnalyzer {
  constructor(aiService, config = {}) {
    super(aiService, config)
    this.maxTitles = config.max_user_titles || 8
    this.minMessages = config.min_messages_for_title || 5
  }

  /**
   * 执行用户称号分析
   * @param {Array} messages - 消息列表
   * @param {Object} stats - 统计信息 (必需)
   * @returns {Promise<Object>} { userTitles: Array, usage: Object }
   */
  async analyze(messages, stats) {
    if (!stats || !stats.users || stats.users.length === 0) {
      logger.warn('[UserTitleAnalyzer] 无用户统计信息')
      return { userTitles: [], usage: null }
    }

    // 过滤消息数太少的用户
    const activeUsers = stats.users
      .filter(user => user.messageCount >= this.minMessages)
      .slice(0, 20)  // 最多分析前 20 名用户

    if (activeUsers.length === 0) {
      logger.warn('[UserTitleAnalyzer] 无活跃用户')
      return { userTitles: [], usage: null }
    }

    logger.info(`[UserTitleAnalyzer] 分析 ${activeUsers.length} 位活跃用户`)

    // 构建用户行为描述
    const userDescriptions = this.buildUserDescriptions(activeUsers)

    // 构建提示词
    const prompt = this.buildPrompt(userDescriptions)

    // 调用 AI
    const result = await this.callAI(prompt, 2500, 0.9)

    if (!result || !result.content) {
      logger.error('[UserTitleAnalyzer] AI 调用失败')
      return { userTitles: [], usage: null }
    }

    // 解析 JSON 响应
    const titles = this.parseJSON(result.content)

    if (!Array.isArray(titles)) {
      logger.error('[UserTitleAnalyzer] 返回格式错误,期望数组')
      return { userTitles: [], usage: result.usage || null }
    }

    // 创建昵称到 user_id 的映射表
    const nicknameToUserId = new Map()
    for (const desc of userDescriptions) {
      nicknameToUserId.set(desc.nickname, desc.user_id)
    }

    // 验证和清理数据，同时添加 user_id
    const validTitles = titles
      .filter(title => title && title.user && title.title && title.mbti && title.reason)
      .map(title => ({
        user: title.user.trim(),
        user_id: nicknameToUserId.get(title.user.trim()) || null,  // 添加 user_id
        title: title.title.trim(),
        mbti: title.mbti.trim().toUpperCase(),
        reason: title.reason.trim()
      }))
      .slice(0, this.maxTitles)

    logger.info(`[UserTitleAnalyzer] 生成 ${validTitles.length} 个用户称号`)

    return { userTitles: validTitles, usage: result.usage || null }
  }

  /**
   * 构建用户行为描述
   * @param {Array} users - 用户统计列表
   */
  buildUserDescriptions(users) {
    return users.map(user => {
      // 判断行为特征
      const nightOwl = parseFloat(user.nightRatio) > 0.3
      const emojiLover = parseFloat(user.emojiRatio) > 0.5
      const talkative = user.messageCount > (users[0]?.messageCount || 0) * 0.5
      const longMessages = parseFloat(user.avgLength) > 50
      const activeReplier = parseFloat(user.replyRatio) > 0.3

      return {
        user_id: user.user_id,  // 保留 user_id 用于后续获取头像
        nickname: user.nickname,
        messageCount: user.messageCount,
        avgLength: user.avgLength,
        emojiRatio: `${(parseFloat(user.emojiRatio) * 100).toFixed(0)}%`,
        replyRatio: `${(parseFloat(user.replyRatio) * 100).toFixed(0)}%`,
        nightRatio: `${(parseFloat(user.nightRatio) * 100).toFixed(0)}%`,
        mostActiveHour: user.mostActiveHour,
        tags: [
          nightOwl && '夜猫子',
          emojiLover && '表情包达人',
          talkative && '话痨',
          longMessages && '长文爱好者',
          activeReplier && '互动积极'
        ].filter(Boolean)
      }
    })
  }

  /**
   * 构建 AI 提示词
   * @param {Array} userDescriptions - 用户行为描述列表
   */
  buildPrompt(userDescriptions) {
    const userText = userDescriptions
      .map((user, i) => {
        return `${i + 1}. ${user.nickname}
   - 消息数: ${user.messageCount} 条
   - 平均长度: ${user.avgLength} 字
   - 表情使用率: ${user.emojiRatio}
   - 回复消息率: ${user.replyRatio}
   - 夜间活跃度: ${user.nightRatio}
   - 最活跃时段: ${user.mostActiveHour} 点
   - 行为标签: ${user.tags.join('、') || '普通用户'}`
      })
      .join('\n\n')

    return `你是一个群聊行为分析专家,负责基于用户的聊天行为模式为他们分配有趣的称号和 MBTI 人格类型。

请为以下用户分配创意称号和 MBTI 类型,最多选择 ${this.maxTitles} 位最有特色的用户。

称号要求:
1. **有趣且贴切**: 称号应该幽默、有创意,同时准确反映用户的行为特征
2. **简洁明了**: 控制在 2-6 个字
3. **多样化**: 避免重复的称号模式
4. **正向友好**: 避免贬义或冒犯性的称号

常见称号参考:
- 话痨王、潜水员、夜猫子、早起鸟
- 表情包大师、段子手、哲学家
- 技术大佬、吃货、游戏王
- 氛围担当、话题终结者
- 沉默寡言、一鸣惊人

MBTI 类型:
- 根据用户的行为模式推测其性格类型 (INTJ, ENFP, ISTP 等 16 种)
- 消息多、互动多 → E (外向)
- 消息少、潜水多 → I (内向)
- 长文、深度讨论 → N (直觉)
- 简短、具体信息 → S (感觉)
- 理性、逻辑性强 → T (思考)
- 感性、情绪表达多 → F (情感)
- 有规律、固定时间 → J (判断)
- 随机、时间不定 → P (知觉)

用户行为数据:
${userText}

---

请选择最多 ${this.maxTitles} 位最有特色的用户,为他们分配称号和 MBTI,并简要说明理由。

**重要：你必须只返回一个 JSON 数组，不要包含任何说明文字、代码块标记或其他内容。直接输出 JSON，从 [ 开始，以 ] 结束。**

返回格式（直接输出，不要用 \`\`\`json 包裹）:
[
  {
    "user": "用户昵称",
    "title": "创意称号",
    "mbti": "MBTI类型",
    "reason": "授予理由 (30字内,说明为什么给这个称号和MBTI)"
  },
  {
    "user": "另一个用户",
    "title": "另一个称号",
    "mbti": "另一个MBTI",
    "reason": "授予理由..."
  }
]`
  }
}
