/**
 * 图片 rkey 管理器
 * 用于维护图片 URL 中的 rkey 参数，避免链接过期导致发送失败
 *
 * 核心原理：rkey 是通用的临时访问令牌，任何 fileid 都可以使用未过期的 rkey 访问
 */

import { logger } from '#lib'

export default class ImageRkeyManager {
  constructor(redisPrefix = 'Yz:groupManager') {
    this.redisPrefix = redisPrefix
    this.rkeyExpiry = 2 * 60 * 60 // 2小时过期
    this.latestRkeyKey = `${redisPrefix}:latest_rkey`
  }

  /**
   * 从 URL 中提取 fileid
   * @param {string} url - 图片 URL
   * @returns {string|null} fileid 或 null
   */
  extractFileId(url) {
    if (!url || typeof url !== 'string') return null

    try {
      const match = url.match(/[?&]fileid=([^&]+)/)
      return match ? match[1] : null
    } catch (err) {
      logger.debug(`[ImageRkeyManager] 提取 fileid 失败: ${err}`)
      return null
    }
  }

  /**
   * 从 URL 中提取 rkey
   * @param {string} url - 图片 URL
   * @returns {string|null} rkey 或 null
   */
  extractRkey(url) {
    if (!url || typeof url !== 'string') return null

    try {
      const match = url.match(/[?&]rkey=([^&]+)/)
      return match ? match[1] : null
    } catch (err) {
      logger.debug(`[ImageRkeyManager] 提取 rkey 失败: ${err}`)
      return null
    }
  }

  /**
   * 提取 URL 的基础部分（不含参数）
   * @param {string} url - 图片 URL
   * @returns {string|null} 基础 URL
   */
  extractBaseUrl(url) {
    if (!url || typeof url !== 'string') return null

    try {
      const match = url.match(/^(https?:\/\/[^?]+)/)
      return match ? match[1] : null
    } catch (err) {
      logger.debug(`[ImageRkeyManager] 提取基础 URL 失败: ${err}`)
      return null
    }
  }

  /**
   * 提取 URL 的其他参数（除了 rkey）
   * @param {string} url - 图片 URL
   * @returns {string} 参数字符串
   */
  extractOtherParams(url) {
    if (!url || typeof url !== 'string') return ''

    try {
      const urlObj = new URL(url)
      const params = new URLSearchParams(urlObj.search)
      params.delete('rkey') // 移除 rkey
      const paramsStr = params.toString()
      return paramsStr ? `?${paramsStr}` : ''
    } catch (err) {
      logger.debug(`[ImageRkeyManager] 提取参数失败: ${err}`)
      return ''
    }
  }

  /**
   * 更新最新的通用 rkey
   * 每次收到新图片时调用，提取并存储最新的 rkey
   * @param {string} url - 新接收到的图片 URL
   */
  async updateRkey(url) {
    if (!url) return

    const rkey = this.extractRkey(url)
    if (!rkey) {
      logger.debug(`[ImageRkeyManager] URL 不包含 rkey，跳过: ${url.substring(0, 100)}`)
      return
    }

    try {
      await redis.setEx(this.latestRkeyKey, this.rkeyExpiry, rkey)
      logger.debug(`[ImageRkeyManager] 已更新通用 rkey: ${rkey.substring(0, 20)}...`)
    } catch (err) {
      logger.error(`[ImageRkeyManager] 更新 rkey 失败: ${err}`)
    }
  }

  /**
   * 批量更新多个图片 URL 的 rkey
   * 只需要更新一次（取最后一个 URL 的 rkey）
   * @param {string[]} urls - 图片 URL 数组
   */
  async updateBatch(urls) {
    if (!Array.isArray(urls) || urls.length === 0) return

    // 只取最后一个 URL 的 rkey（都是通用的，取哪个都一样）
    const lastUrl = urls[urls.length - 1]
    await this.updateRkey(lastUrl)
  }

  /**
   * 刷新图片 URL（用最新的通用 rkey 替换旧 rkey）
   * 如果找不到新的 rkey，返回原 URL
   * @param {string} url - 需要刷新的旧 URL
   * @returns {Promise<string>} 刷新后的 URL
   */
  async refreshUrl(url) {
    if (!url) return url

    const fileid = this.extractFileId(url)
    if (!fileid) {
      // URL 不包含 fileid，直接返回原 URL
      return url
    }

    try {
      // 获取最新的通用 rkey
      const latestRkey = await redis.get(this.latestRkeyKey)

      if (!latestRkey) {
        logger.warn(`[ImageRkeyManager] 未找到最新的通用 rkey`)
        return url // 找不到新 rkey，返回原 URL
      }

      // 构造新 URL
      const baseUrl = this.extractBaseUrl(url)
      const otherParams = this.extractOtherParams(url)

      if (!baseUrl) {
        logger.warn(`[ImageRkeyManager] 无法解析 URL: ${url.substring(0, 100)}`)
        return url
      }

      // 组装新 URL: baseUrl + otherParams + &rkey=latestRkey
      const separator = otherParams.includes('?') ? '&' : '?'
      const newUrl = `${baseUrl}${otherParams}${separator}rkey=${latestRkey}`

      logger.debug(`[ImageRkeyManager] 已刷新 URL: fileid=${fileid.substring(0, 20)}...`)
      return newUrl
    } catch (err) {
      logger.error(`[ImageRkeyManager] 刷新 URL 失败: ${err}`)
      return url
    }
  }

  /**
   * 批量刷新多个图片 URL（优化版：只查询一次 Redis）
   * @param {string[]} urls - 需要刷新的旧 URL 数组
   * @returns {Promise<string[]>} 刷新后的 URL 数组
   */
  async refreshBatch(urls) {
    if (!Array.isArray(urls) || urls.length === 0) return urls

    try {
      // 优化：只查询一次 Redis，而不是每个 URL 都查询一次
      const latestRkey = await redis.get(this.latestRkeyKey)

      if (!latestRkey) {
        logger.warn(`[ImageRkeyManager] 未找到最新的通用 rkey，返回原 URL`)
        return urls
      }

      // 批量处理所有 URL
      const refreshedUrls = urls.map(url => {
        if (!url) return url

        const fileid = this.extractFileId(url)
        if (!fileid) {
          // URL 不包含 fileid，直接返回原 URL
          return url
        }

        const baseUrl = this.extractBaseUrl(url)
        const otherParams = this.extractOtherParams(url)

        if (!baseUrl) {
          logger.warn(`[ImageRkeyManager] 无法解析 URL: ${url.substring(0, 100)}`)
          return url
        }

        // 组装新 URL: baseUrl + otherParams + &rkey=latestRkey
        const separator = otherParams.includes('?') ? '&' : '?'
        return `${baseUrl}${otherParams}${separator}rkey=${latestRkey}`
      })

      logger.debug(`[ImageRkeyManager] 批量刷新 ${urls.length} 个 URL 完成`)
      return refreshedUrls
    } catch (err) {
      logger.error(`[ImageRkeyManager] 批量刷新 URL 失败: ${err}`)
      return urls
    }
  }

  /**
   * 检查是否有最新的通用 rkey 缓存
   * @returns {Promise<boolean>} 是否有缓存
   */
  async hasCache() {
    try {
      return await redis.exists(this.latestRkeyKey)
    } catch (err) {
      logger.error(`[ImageRkeyManager] 检查缓存失败: ${err}`)
      return false
    }
  }

  /**
   * 获取当前缓存的最新 rkey
   * @returns {Promise<string|null>} rkey 或 null
   */
  async getLatestRkey() {
    try {
      return await redis.get(this.latestRkeyKey)
    } catch (err) {
      logger.error(`[ImageRkeyManager] 获取 rkey 失败: ${err}`)
      return null
    }
  }

  /**
   * 清除 rkey 缓存
   */
  async clearCache() {
    try {
      await redis.del(this.latestRkeyKey)
      logger.mark(`[ImageRkeyManager] 已清除 rkey 缓存`)
    } catch (err) {
      logger.error(`[ImageRkeyManager] 清除缓存失败: ${err}`)
    }
  }
}