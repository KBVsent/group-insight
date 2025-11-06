/**
 * 群聊信息管理插件
 * 功能：谁艾特我、词云生成、AI总结
 * 作者：vsentkb
 * 版本：2.0.0（重构版）
 */
import fs from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Config, stopAllServices } from './components/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const appsPath = join(__dirname, 'apps')

// 自动加载所有 apps 下的插件
const apps = {}

try {
  // 加载配置
  await Config.load()
  Config.watch()

  // 统一监听配置变更（避免多个插件重复处理）
  Config.onChange(async (newConfig) => {
    const { reinitializeServices } = await import('./components/index.js')
    await reinitializeServices(newConfig)
    logger.mark('[群聊洞见] 配置变更，所有服务已重新初始化')
  })

  // 扫描并加载所有插件
  const files = fs.readdirSync(appsPath).filter(f => f.endsWith('.js'))

  for (const file of files) {
    try {
      const mod = await import(`./apps/${file}`)
      Object.assign(apps, mod)
      logger.info(`[群聊洞见] 已加载: apps/${file}`)
    } catch (err) {
      logger.error(`[群聊洞见] 加载 apps/${file} 失败:`, err)
    }
  }

  logger.info(`[群聊洞见] 插件初始化完成 (${Object.keys(apps).length} 个模块)`)
} catch (err) {
  logger.error('[群聊洞见] 插件初始化失败:', err)
}

// 进程退出钩子：确保清理所有监听器和资源
process.on('exit', () => {
  logger.info('[群聊洞见] 进程退出，清理资源...')
  stopAllServices()
  Config.stop()
})

export { apps }
