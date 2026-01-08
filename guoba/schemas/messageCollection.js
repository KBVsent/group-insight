export default [
  {
    component: "SOFT_GROUP_BEGIN",
    label: "消息收集配置"
  },
  {
    field: "groupManager.messageCollection.enabled",
    label: "启用消息收集",
    helpMessage: "是否启用群聊消息收集功能",
    component: "Switch"
  },
  {
    field: "groupManager.messageCollection.collectImages",
    label: "收集图片",
    helpMessage: "是否收集群聊中的图片消息",
    component: "Switch"
  },
  {
    field: "groupManager.messageCollection.collectFaces",
    label: "收集表情",
    helpMessage: "是否收集群聊中的表情（必须开启才能统计表情数量）",
    component: "Switch"
  },
  {
    field: "groupManager.messageCollection.collectLinks",
    label: "收集链接分享",
    helpMessage: "是否收集群聊中的链接分享（小程序、分析卡片等）",
    component: "Switch"
  },
  {
    field: "groupManager.messageCollection.collectVideos",
    label: "收集视频",
    helpMessage: "是否收集群聊中的视频消息",
    component: "Switch"
  },
  {
    field: "groupManager.messageCollection.maxMessageLength",
    label: "最大消息长度",
    helpMessage: "消息超过此长度将被截断",
    component: "InputNumber",
    componentProps: {
      min: 50,
      max: 5000,
      placeholder: "请输入最大长度 (50-5000字符)"
    }
  },
  {
    field: "groupManager.messageCollection.nicknameMode",
    label: "昵称显示模式",
    helpMessage: "选择群聊报告中显示的用户昵称来源",
    component: "RadioGroup",
    componentProps: {
      options: [
        { label: "群名片优先", value: "card" },
        { label: "QQ昵称", value: "nickname" }
      ]
    }
  }
]
