/**
 * 群聊洞见插件 - 统一路径管理
 *
 * 集中管理所有路径常量，避免在各个文件中重复计算路径
 * 所有路径都是绝对路径，确保在任何位置调用都能正确解析
 */

import { fileURLToPath } from 'url'
import { dirname, join, basename } from 'path'

// 获取当前文件的路径
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ========== 核心路径 ==========

/** Yunzai 框架根目录 */
export const YUNZAI_ROOT = process.cwd()

/** 插件根目录 (/path/to/Yunzai/plugins/group-insight) */
export const PLUGIN_ROOT = join(__dirname, '..')

/** 插件名称 (group-insight) */
export const PLUGIN_NAME = basename(PLUGIN_ROOT)

// ========== 子目录路径 ==========

/** Apps 目录 - 存放插件命令处理器 */
export const APPS_DIR = join(PLUGIN_ROOT, 'apps')

/** Components 目录 - 核心组件 */
export const COMPONENTS_DIR = join(PLUGIN_ROOT, 'components')

/** Services 目录 - 业务服务层 */
export const SERVICES_DIR = join(PLUGIN_ROOT, 'services')

/** Utils 目录 - 工具函数 */
export const UTILS_DIR = join(PLUGIN_ROOT, 'utils')

/** Config 目录 - 配置文件 */
export const CONFIG_DIR = join(PLUGIN_ROOT, 'config')

/** Resources 目录 - 静态资源 */
export const RESOURCES_DIR = join(PLUGIN_ROOT, 'resources')

/** Data 目录 - 运行时数据存储 */
export const DATA_DIR = join(PLUGIN_ROOT, 'data')

/** Lib 目录 - 库文件 */
export const LIB_DIR = join(PLUGIN_ROOT, 'lib')

/** Constants 目录 - 常量定义 */
export const CONSTANTS_DIR = join(PLUGIN_ROOT, 'constants')

/** Docs 目录 - 文档 */
export const DOCS_DIR = join(PLUGIN_ROOT, 'docs')

/** Scripts 目录 - 工具脚本 */
export const SCRIPTS_DIR = join(PLUGIN_ROOT, 'scripts')

// ========== 具体文件路径 ==========

/** 默认配置文件路径 */
export const DEFAULT_CONFIG_PATH = join(CONFIG_DIR, 'default_config.yaml')

/** 用户配置文件路径 */
export const USER_CONFIG_PATH = join(CONFIG_DIR, 'config.yaml')

/** 停用词文件路径 */
export const STOPWORDS_PATH = join(CONFIG_DIR, 'stopwords.json')

/** 配置模板路径（备份用） */
export const CONFIG_TEMPLATE_PATH = join(CONFIG_DIR, 'config.template.yaml')

// ========== 资源文件路径 ==========

/** 报告模板目录 */
export const SUMMARY_TEMPLATE_DIR = join(RESOURCES_DIR, 'summary')

/** 词云模板目录 */
export const WORDCLOUD_TEMPLATE_DIR = join(RESOURCES_DIR, 'wordcloud')

/** 报告HTML模板路径 */
export const SUMMARY_TEMPLATE_PATH = join(SUMMARY_TEMPLATE_DIR, 'index.html')

/** 词云HTML模板路径 */
export const WORDCLOUD_TEMPLATE_PATH = join(WORDCLOUD_TEMPLATE_DIR, 'index.html')

// ========== 框架相关路径 ==========

/** Yunzai 配置目录 */
export const YUNZAI_CONFIG_DIR = join(YUNZAI_ROOT, 'config')

/** Yunzai 插件目录 */
export const YUNZAI_PLUGINS_DIR = join(YUNZAI_ROOT, 'plugins')

/** Yunzai 日志目录 */
export const YUNZAI_LOGS_DIR = join(YUNZAI_ROOT, 'logs')

/** Yunzai 临时文件目录 */
export const YUNZAI_TEMP_DIR = join(YUNZAI_ROOT, 'temp')

// ========== 工具函数 ==========

/**
 * 获取相对于插件根目录的路径
 * @param {...string} paths - 路径片段
 * @returns {string} 完整路径
 */
export function getPluginPath(...paths) {
  return join(PLUGIN_ROOT, ...paths)
}

/**
 * 获取相对于 Yunzai 根目录的路径
 * @param {...string} paths - 路径片段
 * @returns {string} 完整路径
 */
export function getYunzaiPath(...paths) {
  return join(YUNZAI_ROOT, ...paths)
}

/**
 * 获取相对于资源目录的路径
 * @param {...string} paths - 路径片段
 * @returns {string} 完整路径
 */
export function getResourcePath(...paths) {
  return join(RESOURCES_DIR, ...paths)
}

/**
 * 获取相对于配置目录的路径
 * @param {...string} paths - 路径片段
 * @returns {string} 完整路径
 */
export function getConfigPath(...paths) {
  return join(CONFIG_DIR, ...paths)
}

/**
 * 获取相对于数据目录的路径
 * @param {...string} paths - 路径片段
 * @returns {string} 完整路径
 */
export function getDataPath(...paths) {
  return join(DATA_DIR, ...paths)
}

// ========== 路径验证函数 ==========

import { existsSync } from 'fs'

/**
 * 检查路径是否存在
 * @param {string} path - 要检查的路径
 * @returns {boolean} 路径是否存在
 */
export function pathExists(path) {
  return existsSync(path)
}

/**
 * 确保必需的目录存在
 * @returns {Object} 各目录的存在状态
 */
export function validatePaths() {
  const requiredPaths = {
    apps: APPS_DIR,
    config: CONFIG_DIR,
    resources: RESOURCES_DIR,
    defaultConfig: DEFAULT_CONFIG_PATH,
    summaryTemplate: SUMMARY_TEMPLATE_PATH,
    wordcloudTemplate: WORDCLOUD_TEMPLATE_PATH
  }

  const status = {}
  for (const [name, path] of Object.entries(requiredPaths)) {
    status[name] = {
      path,
      exists: pathExists(path)
    }
  }

  return status
}

// ========== 默认导出 ==========

export default {
  // 核心路径
  YUNZAI_ROOT,
  PLUGIN_ROOT,
  PLUGIN_NAME,

  // 目录路径
  APPS_DIR,
  COMPONENTS_DIR,
  SERVICES_DIR,
  UTILS_DIR,
  CONFIG_DIR,
  RESOURCES_DIR,
  DATA_DIR,
  LIB_DIR,
  CONSTANTS_DIR,

  // 文件路径
  DEFAULT_CONFIG_PATH,
  USER_CONFIG_PATH,
  STOPWORDS_PATH,
  SUMMARY_TEMPLATE_PATH,
  WORDCLOUD_TEMPLATE_PATH,

  // 工具函数
  getPluginPath,
  getYunzaiPath,
  getResourcePath,
  getConfigPath,
  getDataPath,
  pathExists,
  validatePaths
}