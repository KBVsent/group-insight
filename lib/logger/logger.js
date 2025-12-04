/**
 * Group Insight 专用日志器
 */

const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'mark']
const old_logger = global.logger
const logger = {}

const isTRSS = typeof Bot?.makeLog === 'function'

for (const level of levels) {
  if (isTRSS) {
    logger[level] = (...args) => Bot.makeLog(level, args, 'GP Insight')
  } else {
    logger[level] = old_logger?.[level] || (() => {})
  }
}

if (old_logger) {
  Object.setPrototypeOf(logger, old_logger)
}

export { logger }
export default logger
