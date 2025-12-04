/**
 * 增强的插件加载器
 *
 * 特性：
 * - 递归目录扫描（支持 apps/ 下的嵌套目录）
 * - 并发加载（提升启动性能）
 * - 模块缓存（避免重复加载）
 * - 详细的加载统计
 * - 错误分类和友好提示
 * - 重复导出检测
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import chalk from 'chalk'
import { APPS_DIR } from '#paths'
import { logger } from '#lib'

// 模块缓存，避免重复加载
const moduleCache = new Map()

export default class PluginLoader {
  constructor() {
    this.apps = {}
    this.loadedCount = 0
    this.failedCount = 0
    this.errors = []
    this.startTime = Date.now()
  }

  /**
   * 递归扫描目录，获取所有 .js 文件
   * @param {string} dir - 目录路径
   * @returns {Promise<string[]>} JS 文件路径数组
   */
  async traverseDirectory(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      const jsFiles = []

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          // 递归扫描子目录
          const subFiles = await this.traverseDirectory(fullPath)
          jsFiles.push(...subFiles)
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
          // 收集 JS 文件
          jsFiles.push(fullPath)
        }
      }

      return jsFiles
    } catch (err) {
      logger.error('扫描目录失败:', chalk.yellow(dir))
      logger.error(chalk.gray(err.message))
      return []
    }
  }

  /**
   * 加载单个插件文件
   * @param {string} filePath - 文件路径
   * @returns {Promise<Object>} 导出的类集合
   */
  async loadPlugin(filePath) {
    const relativePath = path.relative(APPS_DIR, filePath)

    try {
      // 检查缓存
      let moduleExports = moduleCache.get(filePath)

      if (!moduleExports) {
        // 动态导入模块
        moduleExports = await import(`file://${filePath}`)
        moduleCache.set(filePath, moduleExports)
      }

      const exportedClasses = {}

      // 提取所有导出的类
      for (const [key, value] of Object.entries(moduleExports)) {
        // 检查是否为类（函数且有 prototype）
        if (typeof value === 'function' && value.prototype) {
          if (!this.apps[key]) {
            this.apps[key] = value
            exportedClasses[key] = value
            this.loadedCount++
            logger.debug(
              chalk.green('  ✓') +
              ' 加载成功: ' +
              chalk.cyan(relativePath) +
              ' → ' +
              chalk.yellow(key)
            )
          } else {
            // 检测重复导出
            this.errors.push({
              type: 'duplicate',
              file: relativePath,
              className: key,
              message: `类 "${key}" 已存在，跳过重复导出`
            })
            logger.warn(
              chalk.yellow('  ⚠') +
              ' 重复导出: ' +
              chalk.cyan(relativePath) +
              ' → ' +
              chalk.yellow(key)
            )
          }
        }
      }

      return exportedClasses
    } catch (err) {
      this.failedCount++

      // 错误分类
      let errorType = 'unknown'
      let errorDetail = err.message

      if (err.code === 'ERR_MODULE_NOT_FOUND') {
        errorType = 'dependency'
        const match = err.message.match(/Cannot find (module|package) '(.+?)'/)
        if (match) {
          errorDetail = match[2]
        }
      } else if (err instanceof SyntaxError) {
        errorType = 'syntax'
      } else if (err.message.includes('Cannot read')) {
        errorType = 'runtime'
      }

      this.errors.push({
        type: errorType,
        file: relativePath,
        error: err,
        detail: errorDetail
      })

      // 根据错误类型输出不同的提示
      switch (errorType) {
        case 'dependency':
          logger.error(
            chalk.red('  ✗') +
            ' ' +
            chalk.red('[缺少依赖]') +
            ' ' +
            chalk.cyan(relativePath) +
            ' 需要 ' +
            chalk.yellow(errorDetail)
          )
          break
        case 'syntax':
          logger.error(
            chalk.red('  ✗') +
            ' ' +
            chalk.red('[语法错误]') +
            ' ' +
            chalk.cyan(relativePath) +
            ': ' +
            chalk.gray(errorDetail)
          )
          break
        default:
          logger.error(
            chalk.red('  ✗') +
            ' ' +
            chalk.red('[加载失败]') +
            ' ' +
            chalk.cyan(relativePath) +
            ': ' +
            chalk.gray(errorDetail)
          )
      }

      return {}
    }
  }

  /**
   * 加载所有插件
   * @returns {Promise<Object>} 加载结果
   */
  async loadAll() {
    logger.info(chalk.blue.bold('========== 群聊洞见插件加载 =========='))

    try {
      // 扫描 apps 目录
      const jsFiles = await this.traverseDirectory(APPS_DIR)

      if (jsFiles.length === 0) {
        logger.warn('未找到任何插件文件')
        return this.getResult()
      }

      logger.info(`找到 ${chalk.cyan(jsFiles.length)} 个插件文件，开始加载...`)

      // 并发加载所有文件
      await Promise.all(jsFiles.map(file => this.loadPlugin(file)))

      // 输出统计信息
      this.printSummary()

      // 如果有依赖错误，输出安装提示
      this.printDependencyErrors()

    } catch (err) {
      logger.error('加载过程出错:', err)
    }

    return this.getResult()
  }

  /**
   * 输出加载统计摘要
   */
  printSummary() {
    const endTime = Date.now()
    const duration = endTime - this.startTime

    logger.info(chalk.blue('======================================'))

    if (this.loadedCount > 0) {
      logger.info(
        chalk.green('  ✓ 成功加载:') +
        ` ${chalk.green.bold(this.loadedCount)} 个模块`
      )
    }

    if (this.failedCount > 0) {
      logger.info(
        chalk.yellow('  ⚠ 加载失败:') +
        ` ${chalk.yellow.bold(this.failedCount)} 个文件`
      )
    }

    logger.info(
      chalk.blue('  ⏱ 加载耗时:') +
      ` ${chalk.cyan(duration + 'ms')}`
    )

    logger.info(chalk.blue('======================================\n'))
  }

  /**
   * 输出依赖错误提示
   */
  printDependencyErrors() {
    const depErrors = this.errors.filter(e => e.type === 'dependency')

    if (depErrors.length > 0) {
      logger.info(chalk.yellow('\n⚠️  检测到缺少依赖，请安装：'))

      // 收集所有缺失的包
      const missingPackages = new Set()
      depErrors.forEach(err => {
        if (err.detail) {
          missingPackages.add(err.detail)
        }
      })

      // 输出安装命令
      if (missingPackages.size > 0) {
        const packages = Array.from(missingPackages).join(' ')
        logger.info(
          chalk.gray('  运行命令: ') +
          chalk.green(`pnpm add ${packages}`)
        )
      }
    }
  }

  /**
   * 获取加载结果
   * @returns {Object} 加载结果对象
   */
  getResult() {
    return {
      apps: this.apps,
      loadedCount: this.loadedCount,
      failedCount: this.failedCount,
      errors: this.errors,
      duration: Date.now() - this.startTime
    }
  }

  /**
   * 静态方法：快速加载
   * @returns {Promise<Object>} 加载结果
   */
  static async load() {
    const loader = new PluginLoader()
    return await loader.loadAll()
  }
}

/**
 * 导出便捷加载函数
 */
export async function loadApps() {
  return await PluginLoader.load()
}