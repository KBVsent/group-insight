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
import chalk from 'chalk'
import {
  USER_CONFIG_PATH,
  DEFAULT_CONFIG_PATH,
  CONFIG_TEMPLATE_PATH
} from '#paths'
import { errorLogger } from '#lib'

class Config {
  constructor() {
    this.config = null
    this.watcher = null
    this.callbacks = []
  }

  /**
   * 深度合并配置对象
   * @param {Object} target - 目标对象（用户配置，优先级高）
   * @param {Object} source - 源对象（默认配置）
   * @returns {Object} 合并后的对象
   */
  deepMerge(target, source) {
    // 如果 target 不是对象，使用 source
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
      return source
    }

    // 如果 source 不是对象，使用 target
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return target
    }

    const result = { ...target }

    // 遍历 source 的所有键
    for (const key of Object.keys(source)) {
      if (key in target) {
        // target 中已存在该键，递归合并
        if (
          typeof target[key] === 'object' &&
          target[key] !== null &&
          !Array.isArray(target[key]) &&
          typeof source[key] === 'object' &&
          source[key] !== null &&
          !Array.isArray(source[key])
        ) {
          // 两者都是对象，递归合并
          result[key] = this.deepMerge(target[key], source[key])
        }
        // 否则保持 target 的值（用户自定义优先）
      } else {
        // target 中不存在该键，从 source 补充
        result[key] = source[key]
      }
    }

    return result
  }

  /**
   * 迁移配置文件
   * @returns {boolean} 是否执行了迁移
   */
  migrateConfig() {
    try {
      // 读取两个配置文件
      const userConfigText = fs.readFileSync(USER_CONFIG_PATH, 'utf8')
      const defaultConfigText = fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf8')

      const userConfig = YAML.parse(userConfigText)
      const defaultConfig = YAML.parse(defaultConfigText)

      // 检查版本号
      const userVersion = userConfig.configVersion || 0
      const defaultVersion = defaultConfig.configVersion || 1

      if (userVersion >= defaultVersion) {
        // 版本一致或用户版本更高，不需要迁移
        return false
      }

      errorLogger.mark(`检测到配置文件需要升级: v${userVersion} → v${defaultVersion}`)

      // 深度合并配置（用户配置优先，补充缺失字段）
      const mergedConfig = this.deepMerge(userConfig, defaultConfig)

      // 更新版本号
      mergedConfig.configVersion = defaultVersion

      // 直接使用 YAML.stringify 生成新配置（简单可靠，但会丢失注释）
      // 用户如需查看完整注释，可参考 default_config.yaml
      const newConfigText = YAML.stringify(mergedConfig, {
        indent: 2,
        lineWidth: 0,  // 不折行
        minContentWidth: 0
      })

      // 写入新配置文件
      fs.writeFileSync(USER_CONFIG_PATH, newConfigText, 'utf8')
      errorLogger.success(`配置已升级到 v${defaultVersion}（已保留用户自定义设置）`)
      errorLogger.info('注意：配置升级后注释将被移除', {
        detail: '如需查看完整注释请参考 config/default_config.yaml'
      })

      return true
    } catch (err) {
      errorLogger.error(err, {
        type: { code: 'CONFIG_MIGRATION', level: 'error', message: '配置迁移失败' },
        detail: err.message
      })
      return false
    }
  }

  /**
   * 获取嵌套对象的值
   * @param {Object} obj - 对象
   * @param {Array} path - 路径数组
   * @returns {*} 值
   */
  getNestedValue(obj, path) {
    let current = obj
    for (const key of path) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key]
      } else {
        return undefined
      }
    }
    return current
  }

  /**
   * 转义正则表达式特殊字符
   * @param {string} str - 字符串
   * @returns {string} 转义后的字符串
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  /**
   * 加载配置
   */
  async load() {
    // 检查 default_config.yaml 是否存在
    if (!fs.existsSync(DEFAULT_CONFIG_PATH)) {
      errorLogger.error('默认配置文件不存在', {
        type: { code: 'CONFIG_MISSING', level: 'fatal', message: '配置文件缺失' },
        file: 'config/default_config.yaml'
      })
      return {}
    }

    // 如果 config.yaml 不存在，自动复制 default_config.yaml
    if (!fs.existsSync(USER_CONFIG_PATH)) {
      try {
        errorLogger.info('首次启动，正在创建配置文件...')
        fs.copyFileSync(DEFAULT_CONFIG_PATH, USER_CONFIG_PATH)
        errorLogger.success('配置文件已创建: config/config.yaml')
        errorLogger.mark('请编辑 config/config.yaml 进行个性化配置')
      } catch (err) {
        errorLogger.error(err, {
          type: { code: 'FILE_WRITE', level: 'error', message: '文件写入失败' },
          detail: '创建配置文件失败'
        })
        errorLogger.warn('将使用默认配置')
        // 创建失败时读取默认配置
        const defaultConfig = fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf8')
        this.config = YAML.parse(defaultConfig).groupManager || {}
        return this.config
      }
    }

    // 检查是否需要配置迁移（版本升级）
    try {
      const migrated = this.migrateConfig()
      if (migrated) {
        errorLogger.info('配置迁移完成，正在加载新配置...')
      }
    } catch (err) {
      errorLogger.warn('配置迁移检查失败', {
        detail: err.message
      })
    }

    // 读取 config.yaml
    try {
      const userConfig = fs.readFileSync(USER_CONFIG_PATH, 'utf8')
      const parsedConfig = YAML.parse(userConfig)
      this.config = parsedConfig.groupManager || {}
      errorLogger.debug('配置已加载')
      return this.config
    } catch (err) {
      errorLogger.error(err, {
        type: { code: 'CONFIG_PARSE', level: 'error', message: '配置解析失败' },
        file: 'config/config.yaml'
      })
      errorLogger.warn('将使用默认配置')
      // 解析失败时读取默认配置
      const defaultConfig = fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf8')
      this.config = YAML.parse(defaultConfig).groupManager || {}
      return this.config
    }
  }

  /**
   * 监听配置文件变化
   */
  watch() {
    if (this.watcher) {
      errorLogger.debug('配置监听器已存在')
      return
    }

    if (fs.existsSync(USER_CONFIG_PATH)) {
      this.watcher = chokidar.watch(USER_CONFIG_PATH, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 2000,
          pollInterval: 100
        }
      })

      this.watcher.on('change', async () => {
        errorLogger.mark('检测到配置文件修改，正在重新加载...')

        try {
          const oldConfig = this.config
          await this.load()

          // 调用所有注册的回调
          for (const callback of this.callbacks) {
            try {
              await callback(this.config, oldConfig)
            } catch (err) {
              errorLogger.error(err, {
                detail: '配置回调执行失败'
              })
            }
          }

          errorLogger.success('配置文件重新加载完成')
        } catch (err) {
          errorLogger.error(err, {
            type: { code: 'CONFIG_PARSE', level: 'error', message: '配置重载失败' },
            detail: '配置文件重新加载失败'
          })
        }
      })

      errorLogger.debug('配置文件热重载已启用')
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
      logger.debug('[群聊洞见] 配置监听已停止')
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
