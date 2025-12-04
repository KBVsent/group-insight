/**
 * 群聊信息管理插件
 * 功能：谁艾特我、词云生成、AI总结
 * 作者：vsentkb
 * 版本：2.0.0
 */
import chalk from 'chalk'
import { Config, stopAllServices } from './components/index.js'
import { loadApps, logger } from './lib/index.js'

// 存储加载的插件
let apps = {}

try {
  // 加载配置
  await Config.load()
  Config.watch()

  // 统一监听配置变更
  Config.onChange(async (newConfig) => {
    const { reinitializeServices } = await import('./components/index.js')
    await reinitializeServices(newConfig)
    logger.mark('配置变更，所有服务已重新初始化')
  })

  // 加载所有插件
  const loadResult = await loadApps()
  apps = loadResult.apps

  // 加载结果已由 PluginLoader 输出详细信息，这里输出最终结果
  if (loadResult.loadedCount > 0) {
    logger.info(`插件初始化完成 (${chalk.cyan(loadResult.loadedCount)} 个模块)`)
  } else {
    logger.warn('没有加载任何插件模块')
  }
} catch (err) {
  logger.error('插件初始化失败:', err)
}

// 进程退出钩子：确保清理所有监听器和资源
process.on('exit', () => {
  logger.info('进程退出，清理资源...')
  stopAllServices()
  Config.stop()
})

export { apps }
