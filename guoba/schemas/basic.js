export default [
  {
    component: "SOFT_GROUP_BEGIN",
    label: "基础配置"
  },
  {
    field: "groupManager.retentionDays",
    label: "消息保留天数",
    helpMessage: "历史消息在Redis中保留的天数",
    component: "InputNumber",
    componentProps: {
      min: 7,
      max: 30,
      placeholder: "请输入消息保留天数 (7-30天)"
    }
  },
  {
    field: "groupManager.atRetentionHours",
    label: "艾特记录保留时间",
    helpMessage: "艾特记录保留的小时数",
    component: "InputNumber",
    componentProps: {
      min: 24,
      max: 168,
      placeholder: "请输入保留小时数 (24-168小时)"
    }
  },
  {
    field: "groupManager.contextMessageCount",
    label: "艾特上下文消息数",
    helpMessage: "记录@消息前后该发起人的N条消息",
    component: "InputNumber",
    componentProps: {
      min: 1,
      max: 10,
      placeholder: "请输入上下文消息数 (1-10条)"
    }
  },
  {
    field: "groupManager.nextMessageTimeout",
    label: "等待下一条消息超时时间",
    helpMessage: "收到纯@时，等待发送者下一条消息的超时时间（秒）",
    component: "InputNumber",
    componentProps: {
      min: 10,
      max: 600,
      placeholder: "请输入超时时间 (10-600秒)"
    }
  }
]
