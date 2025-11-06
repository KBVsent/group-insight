/**
 * 配置管理组件（支持热重载）
 *
 * 配置策略：
 * 1. default_config.yaml 作为备份和模板
 * 2. config.yaml 作为实际配置文件
 * 3. 首次启动时，自动复制 default_config.yaml 为 config.yaml
 * 4. 后续只读取 config.yaml，用户可直接修改完整配置
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

    // 检查 default_config.yaml 是否存在
    if (!fs.existsSync(defaultConfigPath)) {
      logger.error('[群聊洞见] 默认配置文件不存在: config/default_config.yaml')
      return {}
    }

    // 如果 config.yaml 不存在，自动复制 default_config.yaml
    if (!fs.existsSync(userConfigPath)) {
      try {
        logger.info('[群聊洞见] 首次启动，正在创建配置文件...')
        fs.copyFileSync(defaultConfigPath, userConfigPath)
        logger.mark('[群聊洞见] 配置文件已创建: config/config.yaml')
        logger.mark('[群聊洞见] 请编辑 config/config.yaml 进行个性化配置')
      } catch (err) {
        logger.error(`[群聊洞见] 创建配置文件失败: ${err}`)
        logger.warn('[群聊洞见] 将使用默认配置')
        // 创建失败时读取默认配置
        const defaultConfig = fs.readFileSync(defaultConfigPath, 'utf8')
        this.config = YAML.parse(defaultConfig).groupManager || {}
        return this.config
      }
    }

    // 读取 config.yaml
    try {
      const userConfig = fs.readFileSync(userConfigPath, 'utf8')
      const parsedConfig = YAML.parse(userConfig)
      this.config = parsedConfig.groupManager || {}
      logger.info('[群聊洞见] 配置已加载')
      return this.config
    } catch (err) {
      logger.error(`[群聊洞见] 配置文件解析失败: ${err}`)
      logger.warn('[群聊洞见] 将使用默认配置')
      // 解析失败时读取默认配置
      const defaultConfig = fs.readFileSync(defaultConfigPath, 'utf8')
      this.config = YAML.parse(defaultConfig).groupManager || {}
      return this.config
    }
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
