/**
 * 错误类型常量定义
 *
 * 用于统一管理插件中的各种错误类型
 * 每种错误类型对应不同的颜色和处理方式
 */

// ========== 错误级别 ==========
export const ERROR_LEVELS = {
  FATAL: 'fatal',      // 致命错误 - 插件无法启动
  ERROR: 'error',      // 严重错误 - 功能无法使用
  WARNING: 'warning',  // 警告 - 功能降级或跳过
  INFO: 'info',        // 信息 - 一般提示
  DEBUG: 'debug'       // 调试 - 详细信息
}

// ========== 错误类型 ==========
export const ERROR_TYPES = {
  // 配置相关
  CONFIG_MISSING: {
    code: 'CONFIG_MISSING',
    level: ERROR_LEVELS.FATAL,
    message: '配置文件缺失'
  },
  CONFIG_PARSE: {
    code: 'CONFIG_PARSE',
    level: ERROR_LEVELS.ERROR,
    message: '配置文件解析失败'
  },
  CONFIG_VALIDATION: {
    code: 'CONFIG_VALIDATION',
    level: ERROR_LEVELS.ERROR,
    message: '配置验证失败'
  },

  // 依赖相关
  DEPENDENCY_MISSING: {
    code: 'DEPENDENCY_MISSING',
    level: ERROR_LEVELS.ERROR,
    message: '缺少依赖包'
  },

  // 服务相关
  SERVICE_INIT: {
    code: 'SERVICE_INIT',
    level: ERROR_LEVELS.ERROR,
    message: '服务初始化失败'
  },
  SERVICE_CONNECTION: {
    code: 'SERVICE_CONNECTION',
    level: ERROR_LEVELS.ERROR,
    message: '服务连接失败'
  },
  SERVICE_TIMEOUT: {
    code: 'SERVICE_TIMEOUT',
    level: ERROR_LEVELS.WARNING,
    message: '服务响应超时'
  },

  // AI服务相关
  AI_API_KEY: {
    code: 'AI_API_KEY',
    level: ERROR_LEVELS.WARNING,
    message: 'AI API Key 未配置'
  },
  AI_REQUEST: {
    code: 'AI_REQUEST',
    level: ERROR_LEVELS.ERROR,
    message: 'AI 请求失败'
  },
  AI_RESPONSE: {
    code: 'AI_RESPONSE',
    level: ERROR_LEVELS.ERROR,
    message: 'AI 响应格式错误'
  },

  // Redis相关
  REDIS_CONNECTION: {
    code: 'REDIS_CONNECTION',
    level: ERROR_LEVELS.ERROR,
    message: 'Redis 连接失败'
  },
  REDIS_OPERATION: {
    code: 'REDIS_OPERATION',
    level: ERROR_LEVELS.ERROR,
    message: 'Redis 操作失败'
  },

  // 文件操作相关
  FILE_NOT_FOUND: {
    code: 'FILE_NOT_FOUND',
    level: ERROR_LEVELS.ERROR,
    message: '文件不存在'
  },
  FILE_READ: {
    code: 'FILE_READ',
    level: ERROR_LEVELS.ERROR,
    message: '文件读取失败'
  },
  FILE_WRITE: {
    code: 'FILE_WRITE',
    level: ERROR_LEVELS.ERROR,
    message: '文件写入失败'
  },

  // 插件加载相关
  PLUGIN_LOAD: {
    code: 'PLUGIN_LOAD',
    level: ERROR_LEVELS.ERROR,
    message: '插件加载失败'
  },
  PLUGIN_SYNTAX: {
    code: 'PLUGIN_SYNTAX',
    level: ERROR_LEVELS.ERROR,
    message: '插件语法错误'
  },

  // 数据处理相关
  DATA_PARSE: {
    code: 'DATA_PARSE',
    level: ERROR_LEVELS.WARNING,
    message: '数据解析失败'
  },
  DATA_VALIDATION: {
    code: 'DATA_VALIDATION',
    level: ERROR_LEVELS.WARNING,
    message: '数据验证失败'
  },

  // 运行时错误
  RUNTIME: {
    code: 'RUNTIME',
    level: ERROR_LEVELS.ERROR,
    message: '运行时错误'
  },
  UNKNOWN: {
    code: 'UNKNOWN',
    level: ERROR_LEVELS.ERROR,
    message: '未知错误'
  }
}

// ========== 错误分类映射 ==========
/**
 * 根据错误对象自动判断错误类型
 * @param {Error} error - 错误对象
 * @returns {Object} 错误类型
 */
export function detectErrorType(error) {
  if (!error) return ERROR_TYPES.UNKNOWN

  const message = error.message || ''
  const code = error.code || ''

  // 根据错误代码判断
  if (code === 'ERR_MODULE_NOT_FOUND') {
    return ERROR_TYPES.DEPENDENCY_MISSING
  }

  if (code === 'ENOENT') {
    return ERROR_TYPES.FILE_NOT_FOUND
  }

  if (code === 'ECONNREFUSED') {
    return ERROR_TYPES.SERVICE_CONNECTION
  }

  // 根据错误消息判断
  if (message.includes('Cannot find module') || message.includes('Cannot find package')) {
    return ERROR_TYPES.DEPENDENCY_MISSING
  }

  if (message.includes('SyntaxError') || error instanceof SyntaxError) {
    return ERROR_TYPES.PLUGIN_SYNTAX
  }

  if (message.includes('Redis') || message.includes('redis')) {
    return ERROR_TYPES.REDIS_OPERATION
  }

  if (message.includes('timeout') || message.includes('Timeout')) {
    return ERROR_TYPES.SERVICE_TIMEOUT
  }

  if (message.includes('parse') || message.includes('Parse')) {
    return ERROR_TYPES.DATA_PARSE
  }

  if (message.includes('API') || message.includes('api')) {
    return ERROR_TYPES.AI_REQUEST
  }

  // 默认返回运行时错误
  return ERROR_TYPES.RUNTIME
}

// ========== 错误消息格式化 ==========
/**
 * 格式化错误消息
 * @param {Object} errorType - 错误类型
 * @param {string} detail - 错误详情
 * @returns {string} 格式化后的消息
 */
export function formatErrorMessage(errorType, detail) {
  if (!errorType) errorType = ERROR_TYPES.UNKNOWN

  let message = `[${errorType.code}] ${errorType.message}`

  if (detail) {
    message += `: ${detail}`
  }

  return message
}

// 默认导出
export default {
  ERROR_LEVELS,
  ERROR_TYPES,
  detectErrorType,
  formatErrorMessage
}