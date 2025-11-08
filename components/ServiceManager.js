/**
 * 服务管理器基类
 * 支持：
 * - Promise-based 初始化
 * - 并发控制
 * - 失败重试
 * - 状态追踪
 */

/**
 * 服务状态枚举
 */
export const ServiceState = {
  NOT_INITIALIZED: 'not_initialized',
  INITIALIZING: 'initializing',
  READY: 'ready',
  DISABLED: 'disabled',  // 服务被配置禁用
  FAILED: 'failed',
  STOPPED: 'stopped'
}

/**
 * 服务管理器基类
 */
export class ServiceManager {
  constructor(name) {
    this.name = name
    this.state = ServiceState.NOT_INITIALIZED
    this.instance = null
    this.initPromise = null
    this.lastError = null
    this.retryCount = 0
    this.maxRetries = 3
  }

  /**
   * 获取服务实例（带自动初始化）
   * @returns {Promise} 返回服务实例的Promise
   */
  async getInstance() {
    switch (this.state) {
      case ServiceState.READY:
        return this.instance

      case ServiceState.DISABLED:
        // 服务已被配置禁用，不尝试初始化
        logger.debug(`[${this.name}] 服务已禁用`)
        return null

      case ServiceState.INITIALIZING:
        // 等待正在进行的初始化
        return this.initPromise

      case ServiceState.FAILED:
        // 检查是否可以重试
        if (this.retryCount < this.maxRetries) {
          logger.info(`[${this.name}] 尝试重新初始化 (第${this.retryCount + 1}次)`)
          return this.initialize()
        }
        logger.debug(`[${this.name}] 服务初始化失败，已达最大重试次数`)
        return null

      case ServiceState.NOT_INITIALIZED:
        return this.initialize()

      case ServiceState.STOPPED:
        logger.debug(`[${this.name}] 服务已停止`)
        return null

      default:
        return null
    }
  }

  /**
   * 初始化服务
   * @returns {Promise} 返回服务实例的Promise
   */
  async initialize() {
    if (this.state === ServiceState.INITIALIZING) {
      return this.initPromise
    }

    this.state = ServiceState.INITIALIZING
    this.initPromise = this._doInitialize()

    try {
      const instance = await this.initPromise

      // 区分禁用和成功
      if (instance === null || instance === undefined) {
        this.state = ServiceState.DISABLED
        this.instance = null
        this.lastError = null
        this.retryCount = 0
        logger.info(`[${this.name}] 服务已禁用`)
        return null
      }

      this.instance = instance
      this.state = ServiceState.READY
      this.lastError = null
      this.retryCount = 0
      logger.info(`[${this.name}] 服务初始化成功`)
      return instance
    } catch (error) {
      this.state = ServiceState.FAILED
      this.lastError = error
      this.retryCount++
      this.instance = null
      logger.error(`[${this.name}] 服务初始化失败: ${error.message}`)
      return null
    } finally {
      this.initPromise = null
    }
  }

  /**
   * 实际的初始化逻辑（子类实现）
   * @returns {Promise} 返回初始化后的服务实例
   */
  async _doInitialize() {
    throw new Error('子类必须实现 _doInitialize 方法')
  }

  /**
   * 重置服务
   */
  async reset() {
    await this.stop()
    this.state = ServiceState.NOT_INITIALIZED
    this.lastError = null
    this.retryCount = 0
  }

  /**
   * 停止服务
   */
  async stop() {
    if (this.state === ServiceState.INITIALIZING) {
      // 等待初始化完成再停止
      await this.initPromise.catch(() => {})
    }

    if (this.instance && typeof this.instance.stop === 'function') {
      try {
        await this.instance.stop()
      } catch (error) {
        logger.error(`[${this.name}] 停止服务时出错: ${error.message}`)
      }
    }

    this.state = ServiceState.STOPPED
    this.instance = null
    this.initPromise = null
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      hasInstance: !!this.instance,
      lastError: this.lastError?.message || null,
      retryCount: this.retryCount
    }
  }
}

/**
 * 单例服务管理器
 * 确保全局只有一个实例
 */
export class SingletonServiceManager extends ServiceManager {
  static instances = new Map()

  static getManager(name, factory) {
    if (!this.instances.has(name)) {
      const manager = new factory(name)
      this.instances.set(name, manager)
    }
    return this.instances.get(name)
  }

  static async resetAll() {
    const resetPromises = []
    for (const manager of this.instances.values()) {
      resetPromises.push(manager.reset())
    }
    await Promise.all(resetPromises)
  }

  static async stopAll() {
    const stopPromises = []
    for (const manager of this.instances.values()) {
      stopPromises.push(manager.stop())
    }
    await Promise.all(stopPromises)
  }

  static getStatus() {
    const status = {}
    for (const [name, manager] of this.instances.entries()) {
      status[name] = manager.getStatus()
    }
    return status
  }
}