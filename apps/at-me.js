/**
 * 谁艾特我功能
 */
import plugin from '../../../lib/plugins/plugin.js'
import { getMessageCollector } from '../components/index.js'
import { logger } from '#lib'

export class AtMePlugin extends plugin {
  constructor() {
    super({
      name: '群聊洞见',
      dsc: '查看谁艾特了你',
      event: 'message.group',
      priority: 5000,
      rule: [
        {
          reg: '^(谁|哪个.*)(艾特|@|at)(我|他|她|它)$',
          fnc: 'whoAtMe',
          permission: 'all'
        }
      ]
    })
  }

  /**
   * 初始化
   */
  async init() {
    // 初始化共享服务（由 Services 模块统一管理）
    await getMessageCollector()
    logger.debug('[谁艾特我] 插件已初始化')
  }

  /**
   * 谁艾特我功能
   */
  async whoAtMe(e) {
    const messageCollector = await getMessageCollector()
    if (!messageCollector) {
      return this.reply('消息收集功能未启用', true)
    }

    // 确定查询的用户
    let userId = e.user_id
    if (e.atBot) {
      userId = Array.isArray(Bot.uin) ? Bot.uin[0] : (e.self_id || Bot.uin)
    } else if (e.at) {
      userId = e.at
    }

    // 获取艾特记录
    const records = await messageCollector.getAtRecords(e.group_id, userId.toString())

    if (!records || records.length === 0) {
      return this.reply('目前还没有人艾特过', true)
    }

    // 构建合并转发消息
    const msgList = []
    const rkeyManager = messageCollector.getRkeyManager()

    for (const record of records) {
      // 如果有上下文消息,先添加上下文
      if (record.contextMessages && record.contextMessages.length > 0) {
        // 按时间正序排列(最早的在前)
        const sortedContext = [...record.contextMessages].sort((a, b) => a.time - b.time)

        for (const ctxMsg of sortedContext) {
          const contextMsgContent = []

          // 添加灰色标注
          contextMsgContent.push('💬 [前文]: ')

          // 添加上下文消息文本（过滤占位符）
          if (ctxMsg.message && ctxMsg.message !== '[表情]') {
            contextMsgContent.push(ctxMsg.message)
          }

          // 添加上下文消息的表情
          if (ctxMsg.faces && ctxMsg.faces.face && ctxMsg.faces.face.length > 0) {
            for (const faceId of ctxMsg.faces.face) {
              try {
                contextMsgContent.push({ type: 'face', id: faceId })
              } catch (err) {
                logger.debug(`发送上下文表情失败 (face ${faceId}): ${err.message}`)
              }
            }
          }

          // 添加上下文消息的图片
          if (ctxMsg.images && ctxMsg.images.length > 0) {
            const refreshedUrls = await rkeyManager.refreshBatch(ctxMsg.images)
            if (refreshedUrls.length > 0) {
              for (const imgUrl of refreshedUrls) {
                contextMsgContent.push(segment.image(imgUrl))
              }
            } else {
              // rkey 过期，添加占位符
              contextMsgContent.push(`[图片x${ctxMsg.images.length}]`)
            }
          }

          // 添加上下文消息的动画表情
          if (ctxMsg.faces && ctxMsg.faces.mface && ctxMsg.faces.mface.length > 0) {
            const refreshedMfaces = await rkeyManager.refreshBatch(ctxMsg.faces.mface)
            if (refreshedMfaces.length > 0) {
              for (const mfaceUrl of refreshedMfaces) {
                contextMsgContent.push(segment.image(mfaceUrl))
              }
            } else {
              // rkey 过期，添加占位符
              contextMsgContent.push(`[动画表情x${ctxMsg.faces.mface.length}]`)
            }
          }

          // 添加上下文消息的链接分享
          if (ctxMsg.links && ctxMsg.links.length > 0) {
            for (const link of ctxMsg.links) {
              const linkText = this.formatLinkText(link)
              contextMsgContent.push(linkText)
            }
          }

          // 添加上下文消息的视频
          if (ctxMsg.videos && ctxMsg.videos.length > 0) {
            const videoUrls = ctxMsg.videos.map(v => v.url).filter(Boolean)
            const refreshedUrls = await rkeyManager.refreshBatch(videoUrls)
            if (refreshedUrls.length > 0) {
              for (let i = 0; i < ctxMsg.videos.length; i++) {
                const refreshedUrl = refreshedUrls[i]
                if (refreshedUrl) {
                  contextMsgContent.push(segment.video(refreshedUrl))
                } else {
                  contextMsgContent.push(`[视频: ${ctxMsg.videos[i].file || '未知'}]`)
                }
              }
            } else {
              // rkey 过期，添加占位符
              for (const video of ctxMsg.videos) {
                contextMsgContent.push(`[视频: ${video.file || video.name || '未知'}]`)
              }
            }
          }

          // 如果内容只有标注，跳过此消息
          if (contextMsgContent.length === 1 && contextMsgContent[0] === '💬 [前文]: ') {
            continue
          }

          msgList.push({
            message: contextMsgContent,
            user_id: record.user_id,
            nickname: `${record.nickname}`,
            time: ctxMsg.time
          })
        }
      }

      // 构建主@消息
      const msg = []

      // 添加回复消息
      if (record.messageId) {
        msg.push({ type: 'reply', id: record.messageId })
      }

      // 添加文本 (如果为空则显示 [仅@])
      if (record.message) {
        msg.push(record.message)
      } else {
        msg.push('[仅@]')
      }

      // 添加普通表情
      if (record.faces && record.faces.face && record.faces.face.length > 0) {
        for (const faceId of record.faces.face) {
          try {
            msg.push({ type: 'face', id: faceId })
          } catch (err) {
            logger.debug(`发送表情失败 (face ${faceId}): ${err.message}`)
          }
        }
      }

      // 添加图片（刷新 rkey）
      if (record.images && record.images.length > 0) {
        const refreshedUrls = await rkeyManager.refreshBatch(record.images)
        if (refreshedUrls.length > 0) {
          for (const imgUrl of refreshedUrls) {
            msg.push(segment.image(imgUrl))
          }
        } else {
          // rkey 过期，添加占位符
          msg.push(`[图片x${record.images.length}]`)
        }
      }

      // 添加动画表情（刷新 rkey）
      if (record.faces && record.faces.mface && record.faces.mface.length > 0) {
        const refreshedMfaces = await rkeyManager.refreshBatch(record.faces.mface)
        if (refreshedMfaces.length > 0) {
          for (const mfaceUrl of refreshedMfaces) {
            msg.push(segment.image(mfaceUrl))
          }
        } else {
          // rkey 过期，添加占位符
          msg.push(`[动画表情x${record.faces.mface.length}]`)
        }
      }

      // 添加链接分享
      if (record.links && record.links.length > 0) {
        for (const link of record.links) {
          const linkText = this.formatLinkText(link)
          msg.push(linkText)
        }
      }

      // 添加视频（刷新 rkey）
      if (record.videos && record.videos.length > 0) {
        const videoUrls = record.videos.map(v => v.url).filter(Boolean)
        const refreshedUrls = await rkeyManager.refreshBatch(videoUrls)
        if (refreshedUrls.length > 0) {
          for (let i = 0; i < record.videos.length; i++) {
            const refreshedUrl = refreshedUrls[i]
            if (refreshedUrl) {
              msg.push(segment.video(refreshedUrl))
            } else {
              msg.push(`[视频: ${record.videos[i].file || '未知'}]`)
            }
          }
        } else {
          // rkey 过期，添加占位符
          for (const video of record.videos) {
            msg.push(`[视频: ${video.file || video.name || '未知'}]`)
          }
        }
      }

      msgList.push({
        message: msg,
        user_id: record.user_id,
        nickname: record.nickname,
        time: record.time
      })

      // 如果有下一条消息,在主消息之后添加
      if (record.nextMessages && record.nextMessages.length > 0) {
        // 按时间正序排列(最早的在前)
        const sortedNext = [...record.nextMessages].sort((a, b) => a.time - b.time)

        for (const nextMsg of sortedNext) {
          const nextMsgContent = []

          // 添加标注
          nextMsgContent.push('💬 [后文]: ')

          // 添加下一条消息文本
          if (nextMsg.message) {
            nextMsgContent.push(nextMsg.message)
          }

          // 添加下一条消息的表情
          if (nextMsg.faces && nextMsg.faces.face && nextMsg.faces.face.length > 0) {
            for (const faceId of nextMsg.faces.face) {
              try {
                nextMsgContent.push({ type: 'face', id: faceId })
              } catch (err) {
                logger.debug(`发送下一条消息表情失败 (face ${faceId}): ${err.message}`)
              }
            }
          }

          // 添加下一条消息的图片
          if (nextMsg.images && nextMsg.images.length > 0) {
            const refreshedUrls = await rkeyManager.refreshBatch(nextMsg.images)
            if (refreshedUrls.length > 0) {
              for (const imgUrl of refreshedUrls) {
                nextMsgContent.push(segment.image(imgUrl))
              }
            } else {
              // rkey 过期，添加占位符
              nextMsgContent.push(`[图片x${nextMsg.images.length}]`)
            }
          }

          // 添加下一条消息的动画表情
          if (nextMsg.faces && nextMsg.faces.mface && nextMsg.faces.mface.length > 0) {
            const refreshedMfaces = await rkeyManager.refreshBatch(nextMsg.faces.mface)
            if (refreshedMfaces.length > 0) {
              for (const mfaceUrl of refreshedMfaces) {
                nextMsgContent.push(segment.image(mfaceUrl))
              }
            } else {
              // rkey 过期，添加占位符
              nextMsgContent.push(`[动画表情x${nextMsg.faces.mface.length}]`)
            }
          }

          // 添加下一条消息的链接分享
          if (nextMsg.links && nextMsg.links.length > 0) {
            for (const link of nextMsg.links) {
              const linkText = this.formatLinkText(link)
              nextMsgContent.push(linkText)
            }
          }

          // 添加下一条消息的视频（刷新 rkey）
          if (nextMsg.videos && nextMsg.videos.length > 0) {
            const videoUrls = nextMsg.videos.map(v => v.url).filter(Boolean)
            const refreshedUrls = await rkeyManager.refreshBatch(videoUrls)
            if (refreshedUrls.length > 0) {
              for (let i = 0; i < nextMsg.videos.length; i++) {
                const refreshedUrl = refreshedUrls[i]
                if (refreshedUrl) {
                  nextMsgContent.push(segment.video(refreshedUrl))
                } else {
                  nextMsgContent.push(`[视频: ${nextMsg.videos[i].file || '未知'}]`)
                }
              }
            } else {
              // rkey 过期，添加占位符
              for (const video of nextMsg.videos) {
                nextMsgContent.push(`[视频: ${video.file || video.name || '未知'}]`)
              }
            }
          }

          // 如果内容只有标注，跳过此消息
          if (nextMsgContent.length === 1 && nextMsgContent[0] === '💬 [后文]: ') {
            continue
          }

          msgList.push({
            message: nextMsgContent,
            user_id: record.user_id,
            nickname: `${record.nickname}`,
            time: nextMsg.time
          })
        }
      }
    }

    // 发送合并转发消息
    try {
      let forwardMsg
      if (e.group && e.group.makeForwardMsg) {
        forwardMsg = await e.group.makeForwardMsg(msgList)
      } else {
        forwardMsg = await Bot.makeForwardMsg(msgList)
      }

      return this.reply(forwardMsg)
    } catch (err) {
      logger.error(`发送合并转发消息失败: ${err}`)
      return this.reply('发送消息失败，请查看日志', true)
    }
  }

  /**
   * 格式化链接分享信息为文本
   * @param {object} link - 链接数据
   * @returns {string} 格式化后的文本
   */
  formatLinkText(link) {
    if (!link) return '[链接]'

    const typeLabels = {
      link: '🔗',
      miniapp: '📱',
      music: '🎵',
      json_other: '📄'
    }

    const icon = typeLabels[link.type] || '🔗'
    const source = link.source || '未知来源'
    const title = link.title || '未知内容'
    const url = link.url || ''

    let result = `${icon}[${source}] ${title}`
    if (url) {
      result += `\n🔗 ${url}`
    }

    return result
  }
}
