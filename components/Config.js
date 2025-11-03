/**
 * 配置管理组件（支持热重载）
 */
import chokidar from 'chokidar'
import YAML from 'yaml'
import fs from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const pluginRoot = join(__dirname, '..')

class Config {
  constructor() {
    this.config = null
    this.watcher = null
    this.callbacks = []
  }

  /**
   * 加载配置
   */
  async load() {
    const defaultConfigPath = join(pluginRoot, 'config/default_config.yaml')
    const userConfigPath = join(pluginRoot, 'config/config.yaml')

    let config = {}

    // 读取默认配置
    if (fs.existsSync(defaultConfigPath)) {
      const defaultConfig = fs.readFileSync(defaultConfigPath, 'utf8')
      config = YAML.parse(defaultConfig).groupManager || {}
    } else {
      logger.warn('[群聊洞见] 默认配置文件不存在')
      return config
    }

    // 合并用户配置
    if (fs.existsSync(userConfigPath)) {
      const userConfig = fs.readFileSync(userConfigPath, 'utf8')
      const userSettings = YAML.parse(userConfig).groupManager || {}
      config = { ...config, ...userSettings }
      logger.info('[群聊洞见] 已加载用户配置')
    } else {
      logger.info('[群聊洞见] 未找到用户配置，使用默认配置')
    }

    this.config = config
    return config
  }

  /**
   * 监听配置文件变化
   */
  watch() {
    if (this.watcher) {
      logger.debug('[群聊洞见] 配置监听器已存在')
      return
    }

    const configPath = join(pluginRoot, 'config/config.yaml')

    if (fs.existsSync(configPath)) {
      this.watcher = chokidar.watch(configPath, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 2000,
          pollInterval: 100
        }
      })

      this.watcher.on('change', async () => {
        logger.mark('[群聊洞见] 检测到配置文件修改，正在重新加载...')

        try {
          const oldConfig = this.config
          await this.load()

          // 调用所有注册的回调
          for (const callback of this.callbacks) {
            try {
              await callback(this.config, oldConfig)
            } catch (err) {
              logger.error(`[群聊洞见] 配置回调执行失败: ${err}`)
            }
          }

          logger.mark('[群聊洞见] 配置文件重新加载完成')
        } catch (err) {
          logger.error(`[群聊洞见] 配置文件重新加载失败: ${err}`)
        }
      })

      logger.info('[群聊洞见] 配置文件热重载已启用')
    }
  }

  /**
   * 注册配置变更回调
   */
  onChange(callback) {
    this.callbacks.push(callback)
  }

  /**
   * 停止监听
   */
  stop() {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
      logger.info('[群聊洞见] 配置监听已停止')
    }
  }

  /**
   * 获取配置
   */
  get() {
    return this.config
  }
}

// 单例
const configInstance = new Config()

export default configInstance
