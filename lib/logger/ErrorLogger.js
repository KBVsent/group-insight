/**
 * 增强的错误日志器
 *
 * 提供彩色输出、错误分类、堆栈美化等功能
 * 让错误信息更易读，问题定位更快速
 */

import chalk from 'chalk'
import {
  ERROR_LEVELS,
  ERROR_TYPES,
  detectErrorType,
  formatErrorMessage
} from '../../constants/errorTypes.js'

// 插件名称前缀
const PLUGIN_PREFIX = '[群聊洞见]'

// 颜色方案配置
const COLOR_SCHEMES = {
  [ERROR_LEVELS.FATAL]: {
    prefix: chalk.bgRed.white.bold,
    message: chalk.red.bold,
    detail: chalk.red
  },
  [ERROR_LEVELS.ERROR]: {
    prefix: chalk.red.bold,
    message: chalk.red,
    detail: chalk.gray
  },
  [ERROR_LEVELS.WARNING]: {
    prefix: chalk.yellow.bold,
    message: chalk.yellow,
    detail: chalk.gray
  },
  [ERROR_LEVELS.INFO]: {
    prefix: chalk.blue.bold,
    message: chalk.blue,
    detail: chalk.gray
  },
  [ERROR_LEVELS.DEBUG]: {
    prefix: chalk.gray,
    message: chalk.gray,
    detail: chalk.gray
  }
}

// 成功和特殊状态的颜色
const STATUS_COLORS = {
  success: chalk.green,
  highlight: chalk.cyan,
  emphasis: chalk.magenta,
  file: chalk.cyan,
  code: chalk.yellow,
  number: chalk.green
}

export default class ErrorLogger {
  constructor(options = {}) {
    this.prefix = options.prefix || PLUGIN_PREFIX
    this.showStack = options.showStack !== false
    this.showTimestamp = options.showTimestamp === true
  }

  /**
   * 获取时间戳
   * @returns {string} 格式化的时间戳
   */
  getTimestamp() {
    if (!this.showTimestamp) return ''
    const now = new Date()
    return chalk.gray(`[${now.toISOString()}] `)
  }

  /**
   * 美化文件路径
   * @param {string} path - 文件路径
   * @returns {string} 美化后的路径
   */
  beautifyPath(path) {
    // 提取相对路径部分
    const match = path.match(/plugins\/group-insight\/(.+)/)
    if (match) {
      return STATUS_COLORS.file(match[1])
    }
    return STATUS_COLORS.file(path)
  }

  /**
   * 美化堆栈信息
   * @param {string} stack - 原始堆栈
   * @returns {string} 美化后的堆栈
   */
  beautifyStack(stack) {
    if (!stack || !this.showStack) return ''

    const lines = stack.split('\n')
    const beautified = []

    for (const line of lines) {
      // 跳过第一行（错误消息）
      if (line === lines[0]) continue

      // 提取文件信息
      const fileMatch = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/)
      if (fileMatch) {
        const [, func, file, lineNum, colNum] = fileMatch
        const beautifiedFile = this.beautifyPath(file)
        beautified.push(
          chalk.gray('    at ') +
          STATUS_COLORS.code(func) +
          chalk.gray(' (') +
          beautifiedFile +
          chalk.gray(':') +
          STATUS_COLORS.number(lineNum) +
          chalk.gray(':') +
          STATUS_COLORS.number(colNum) +
          chalk.gray(')')
        )
      } else {
        // 保留原始格式
        beautified.push(chalk.gray(line))
      }
    }

    return beautified.join('\n')
  }

  /**
   * 记录错误日志
   * @param {Error|string} error - 错误对象或消息
   * @param {Object} options - 配置选项
   */
  error(error, options = {}) {
    const errorType = options.type || detectErrorType(error)
    const scheme = COLOR_SCHEMES[errorType.level || ERROR_LEVELS.ERROR]

    // 构建前缀
    let prefix = this.getTimestamp() + scheme.prefix(this.prefix)

    // 错误分类标签
    if (errorType.code) {
      prefix += ' ' + scheme.prefix(`[${errorType.message}]`)
    }

    // 错误消息
    let message = ''
    if (typeof error === 'string') {
      message = error
    } else if (error instanceof Error) {
      message = error.message
    } else {
      message = String(error)
    }

    // 添加详细信息
    if (options.detail) {
      message += scheme.detail(` - ${options.detail}`)
    }

    // 输出主错误信息
    logger.error(prefix + ' ' + scheme.message(message))

    // 输出文件信息
    if (options.file) {
      logger.error(
        chalk.gray('  📁 文件: ') +
        this.beautifyPath(options.file)
      )
    }

    // 输出堆栈信息
    if (error instanceof Error && error.stack && this.showStack) {
      const beautifiedStack = this.beautifyStack(error.stack)
      if (beautifiedStack) {
        logger.error(chalk.gray('  📚 堆栈:'))
        logger.error(beautifiedStack)
      }
    }

    // 输出建议
    if (options.suggestion) {
      logger.error(
        chalk.gray('  💡 建议: ') +
        STATUS_COLORS.highlight(options.suggestion)
      )
    }
  }

  /**
   * 记录警告日志
   * @param {string} message - 警告消息
   * @param {Object} options - 配置选项
   */
  warn(message, options = {}) {
    const scheme = COLOR_SCHEMES[ERROR_LEVELS.WARNING]
    const prefix = this.getTimestamp() + scheme.prefix(this.prefix)

    logger.warn(prefix + ' ' + scheme.message(message))

    if (options.detail) {
      logger.warn(chalk.gray('  ℹ️  ') + scheme.detail(options.detail))
    }
  }

  /**
   * 记录信息日志
   * @param {string} message - 信息消息
   * @param {Object} options - 配置选项
   */
  info(message, options = {}) {
    const scheme = COLOR_SCHEMES[ERROR_LEVELS.INFO]
    const prefix = this.getTimestamp() + scheme.prefix(this.prefix)

    logger.info(prefix + ' ' + scheme.message(message))

    if (options.detail) {
      logger.info(chalk.gray('  ') + scheme.detail(options.detail))
    }
  }

  /**
   * 记录成功日志
   * @param {string} message - 成功消息
   * @param {Object} options - 配置选项
   */
  success(message, options = {}) {
    const prefix = this.getTimestamp() + STATUS_COLORS.success.bold(this.prefix)

    logger.info(prefix + ' ' + STATUS_COLORS.success(message))

    if (options.detail) {
      logger.info(chalk.gray('  ') + STATUS_COLORS.success(options.detail))
    }
  }

  /**
   * 记录调试日志
   * @param {string} message - 调试消息
   * @param {Object} options - 配置选项
   */
  debug(message, options = {}) {
    const scheme = COLOR_SCHEMES[ERROR_LEVELS.DEBUG]
    const prefix = this.getTimestamp() + scheme.prefix(this.prefix)

    logger.debug(prefix + ' ' + scheme.message(message))

    if (options.data) {
      logger.debug(chalk.gray('  📊 数据:'), options.data)
    }
  }

  /**
   * 记录标记日志（重要信息）
   * @param {string} message - 标记消息
   */
  mark(message) {
    const prefix = this.getTimestamp() + STATUS_COLORS.emphasis.bold(this.prefix)
    logger.mark(prefix + ' ' + STATUS_COLORS.emphasis(message))
  }

  /**
   * 批量记录错误
   * @param {Array} errors - 错误数组
   * @param {string} title - 标题
   */
  errorBatch(errors, title = '错误汇总') {
    if (!errors || errors.length === 0) return

    // 输出标题
    logger.error(
      chalk.red.bold('\n========== ' + title + ' ==========')
    )

    // 按错误类型分组
    const grouped = {}
    for (const error of errors) {
      const errorType = detectErrorType(error)
      const key = errorType.code
      if (!grouped[key]) {
        grouped[key] = []
      }
      grouped[key].push(error)
    }

    // 输出分组错误
    for (const [code, groupErrors] of Object.entries(grouped)) {
      const errorType = ERROR_TYPES[code] || ERROR_TYPES.UNKNOWN
      logger.error(
        chalk.red.bold(`\n  ${errorType.message} (${groupErrors.length}个):`)
      )

      for (const error of groupErrors) {
        const message = error.file
          ? `    - ${this.beautifyPath(error.file)}: ${error.detail || error.message}`
          : `    - ${error.detail || error.message}`
        logger.error(chalk.red(message))
      }
    }

    // 输出建议
    if (grouped['DEPENDENCY_MISSING']) {
      logger.error(
        chalk.yellow('\n  💡 建议: 运行 ') +
        chalk.green('pnpm install') +
        chalk.yellow(' 安装缺失的依赖')
      )
    }

    logger.error(
      chalk.red.bold('=====================================\n')
    )
  }

  /**
   * 创建表格输出
   * @param {Array} data - 数据数组
   * @param {Array} headers - 表头
   */
  table(data, headers) {
    // 计算列宽
    const colWidths = headers.map((h, i) => {
      const maxWidth = Math.max(
        h.length,
        ...data.map(row => String(row[i] || '').length)
      )
      return maxWidth + 2
    })

    // 输出表头
    const headerRow = headers
      .map((h, i) => chalk.cyan.bold(h.padEnd(colWidths[i])))
      .join('')
    logger.info(headerRow)

    // 输出分隔线
    const separator = colWidths
      .map(w => chalk.gray('─'.repeat(w)))
      .join('')
    logger.info(separator)

    // 输出数据行
    for (const row of data) {
      const dataRow = row
        .map((cell, i) => String(cell || '').padEnd(colWidths[i]))
        .join('')
      logger.info(dataRow)
    }
  }
}

// 创建默认实例
export const errorLogger = new ErrorLogger()

// 导出便捷方法
export const logError = errorLogger.error.bind(errorLogger)
export const logWarn = errorLogger.warn.bind(errorLogger)
export const logInfo = errorLogger.info.bind(errorLogger)
export const logSuccess = errorLogger.success.bind(errorLogger)
export const logDebug = errorLogger.debug.bind(errorLogger)
export const logMark = errorLogger.mark.bind(errorLogger)