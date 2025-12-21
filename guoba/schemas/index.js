import basic from "./basic.js"
import ai from "./ai.js"
import wordCloud from "./wordCloud.js"
import messageCollection from "./messageCollection.js"
import schedule from "./schedule.js"
import summary from "./summary.js"
import fs from 'node:fs'
import YAML from 'yaml'
import { USER_CONFIG_PATH } from '#paths'

// 导出所有 schemas
export const schemas = [
  basic,
  ai,
  wordCloud,
  messageCollection,
  schedule,
  summary
].flat()

/**
 * 获取配置数据
 * 从 config/config.yaml 读取完整配置
 */
export function getConfigData() {
  try {
    if (!fs.existsSync(USER_CONFIG_PATH)) {
      return { groupManager: {} }
    }

    const configText = fs.readFileSync(USER_CONFIG_PATH, 'utf8')
    const config = YAML.parse(configText)

    return config || { groupManager: {} }
  } catch (err) {
    console.error('读取配置失败:', err)
    return { groupManager: {} }
  }
}

/**
 * 设置配置数据
 * 写入 config/config.yaml
 */
export async function setConfigData(data, { Result }) {
  try {
    // 读取当前配置
    let currentConfig = { groupManager: {} }
    if (fs.existsSync(USER_CONFIG_PATH)) {
      const configText = fs.readFileSync(USER_CONFIG_PATH, 'utf8')
      currentConfig = YAML.parse(configText) || { groupManager: {} }
    }

    // 合并新配置
    for (const key in data) {
      const keys = key.split('.')
      let target = currentConfig

      // 遍历到倒数第二层
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i]
        if (!target[k] || typeof target[k] !== 'object') {
          target[k] = {}
        }
        target = target[k]
      }

      // 设置最后一层的值
      const lastKey = keys[keys.length - 1]
      target[lastKey] = data[key]
    }

    // 写入配置文件
    const newConfigText = YAML.stringify(currentConfig, {
      indent: 2,
      lineWidth: 0,
      minContentWidth: 0
    })

    fs.writeFileSync(USER_CONFIG_PATH, newConfigText, 'utf8')

    return Result.ok({}, "配置保存成功！")
  } catch (err) {
    console.error('保存配置失败:', err)
    return Result.error({}, `配置保存失败: ${err.message}`)
  }
}
