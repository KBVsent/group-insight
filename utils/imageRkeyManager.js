/**
 * 图片 rkey 管理器
 * 用于维护图片 URL 中的 rkey 参数，避免链接过期导致发送失败
 */

export default class ImageRkeyManager {
  constructor(redisPrefix = 'Yz:groupManager:rkey') {
    this.redisPrefix = redisPrefix
    this.rkeyExpiry = 7 * 24 * 60 * 60 // 7天过期（保守估计）
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
   * 更新图片 URL 的 rkey
   * 每次收到新图片时调用，存储最新的完整 URL
   * @param {string} url - 新接收到的图片 URL
   */
  async updateRkey(url) {
    if (!url) return

    const fileid = this.extractFileId(url)
    if (!fileid) {
      logger.debug(`[ImageRkeyManager] URL 不包含 fileid，跳过: ${url.substring(0, 100)}`)
      return
    }

    try {
      const key = `${this.redisPrefix}:${fileid}`
      await redis.setEx(key, this.rkeyExpiry, url)
      logger.debug(`[ImageRkeyManager] 已更新 rkey: fileid=${fileid.substring(0, 20)}...`)
    } catch (err) {
      logger.error(`[ImageRkeyManager] 更新 rkey 失败: ${err}`)
    }
  }

  /**
   * 批量更新多个图片 URL 的 rkey
   * @param {string[]} urls - 图片 URL 数组
   */
  async updateBatch(urls) {
    if (!Array.isArray(urls) || urls.length === 0) return

    const promises = urls.map(url => this.updateRkey(url))
    await Promise.all(promises)
  }

  /**
   * 刷新图片 URL（用最新的 rkey 替换旧 URL）
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
      const key = `${this.redisPrefix}:${fileid}`
      const latestUrl = await redis.get(key)

      if (latestUrl) {
        logger.debug(`[ImageRkeyManager] 已刷新 URL: fileid=${fileid.substring(0, 20)}...`)
        return latestUrl
      } else {
        logger.warn(`[ImageRkeyManager] 未找到最新 rkey: fileid=${fileid.substring(0, 20)}...`)
        return url // 找不到新 rkey，返回原 URL
      }
    } catch (err) {
      logger.error(`[ImageRkeyManager] 刷新 URL 失败: ${err}`)
      return url
    }
  }

  /**
   * 批量刷新多个图片 URL
   * @param {string[]} urls - 需要刷新的旧 URL 数组
   * @returns {Promise<string[]>} 刷新后的 URL 数组
   */
  async refreshBatch(urls) {
    if (!Array.isArray(urls) || urls.length === 0) return urls

    const promises = urls.map(url => this.refreshUrl(url))
    return await Promise.all(promises)
  }

  /**
   * 检查 URL 是否有最新的 rkey 缓存
   * @param {string} url - 图片 URL
   * @returns {Promise<boolean>} 是否有缓存
   */
  async hasCache(url) {
    const fileid = this.extractFileId(url)
    if (!fileid) return false

    try {
      const key = `${this.redisPrefix}:${fileid}`
      return await redis.exists(key)
    } catch (err) {
      logger.error(`[ImageRkeyManager] 检查缓存失败: ${err}`)
      return false
    }
  }

  /**
   * 清除指定 fileid 的缓存
   * @param {string} fileid - 文件 ID
   */
  async clearCache(fileid) {
    if (!fileid) return

    try {
      const key = `${this.redisPrefix}:${fileid}`
      await redis.del(key)
      logger.debug(`[ImageRkeyManager] 已清除缓存: fileid=${fileid.substring(0, 20)}...`)
    } catch (err) {
      logger.error(`[ImageRkeyManager] 清除缓存失败: ${err}`)
    }
  }

  /**
   * 清除所有 rkey 缓存
   */
  async clearAllCache() {
    try {
      const keys = await redis.keys(`${this.redisPrefix}:*`)
      if (keys.length > 0) {
        await redis.del(...keys)
        logger.mark(`[ImageRkeyManager] 已清除所有 rkey 缓存，共 ${keys.length} 个`)
      }
    } catch (err) {
      logger.error(`[ImageRkeyManager] 清除所有缓存失败: ${err}`)
    }
  }
}