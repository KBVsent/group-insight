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
    field: "groupManager.schedule.send.mode",
    label: "发送模式",
    helpMessage: "定时报告生成后的发送方式",
    bottomHelpMessage: "只针对上方白名单群生效",
    component: "RadioGroup",
    componentProps: {
      options: [
        { label: "仅生成报告（不发送）", value: "disabled" },
        { label: "立即发送", value: "immediate" },
        { label: "定时发送", value: "scheduled" }
      ]
    }
  },
  {
    field: "groupManager.schedule.send.sendHour",
    label: "发送时间（小时）",
    helpMessage: "发送模式为「定时发送」时生效",
    bottomHelpMessage: "当发送模式为 定时发送 时生效，表示次日几点发送前一天的报告",
    component: "InputNumber",
    componentProps: {
      min: 0,
      max: 23,
      placeholder: "0-23"
    }
  },
  {
    field: "groupManager.schedule.send.sendMinute",
    label: "发送时间（分钟）",
    helpMessage: "发送模式为「定时发送」时生效",
    bottomHelpMessage: "当发送模式为 定时发送 时生效，与小时配合使用",
    component: "InputNumber",
    componentProps: {
      min: 0,
      max: 59,
      placeholder: "0-59"
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
