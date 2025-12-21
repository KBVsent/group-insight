export default [
  {
    component: "SOFT_GROUP_BEGIN",
    label: "定时总结配置"
  },
  {
    field: "groupManager.schedule.enabled",
    label: "启用定时总结",
    helpMessage: "是否启用自动定时总结功能",
    component: "Switch"
  },
  {
    field: "groupManager.schedule.whitelist",
    label: "白名单群列表",
    helpMessage: "仅这些群会启用定时总结，为空则不启用",
    bottomHelpMessage: "从已有群聊中选择需要定时总结的群",
    component: "GSelectGroup",
    componentProps: {
      placeholder: "点击选择要启用定时总结的群"
    }
  },
  {
    field: "groupManager.schedule.minMessages",
    label: "最小消息数阈值",
    helpMessage: "消息少于此数量时跳过总结",
    component: "InputNumber",
    componentProps: {
      min: 1,
      max: 1000,
      placeholder: "请输入最小消息数 (1-1000条)"
    }
  },
  {
    field: "groupManager.schedule.concurrency",
    label: "并发数",
    helpMessage: "同时处理的群数量",
    component: "InputNumber",
    componentProps: {
      min: 1,
      max: 10,
      placeholder: "请输入并发数 (1-10个)"
    }
  },
  {
    field: "groupManager.schedule.cooldownMinutes",
    label: "冷却时长（分钟）",
    helpMessage: "普通用户触发后该群将进入冷却期，冷却期内再次触发将返回缓存的报告",
    bottomHelpMessage: "主人和定时任务不受此限制",
    component: "InputNumber",
    componentProps: {
      min: 1,
      max: 60,
      placeholder: "请输入冷却时长 (1-60分钟)"
    }
  }
]
