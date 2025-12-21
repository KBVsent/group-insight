export default [
  {
    component: "SOFT_GROUP_BEGIN",
    label: "总结功能配置"
  },
  {
    field: "groupManager.summary.template",
    label: "模板选择",
    helpMessage: "总结报告的视觉风格模板",
    bottomHelpMessage: "default-现代科技风格 / scrapbook-手账风格",
    component: "RadioGroup",
    componentProps: {
      options: [
        { label: "现代科技风格", value: "default" },
        { label: "手账风格", value: "scrapbook" }
      ]
    }
  },
  {
    component: "Divider",
    label: "渲染质量"
  },
  {
    field: "groupManager.summary.render.imgType",
    label: "图片格式",
    helpMessage: "总结报告图片的输出格式",
    bottomHelpMessage: "png-无损但文件较大 / jpeg-有损但文件较小",
    component: "RadioGroup",
    componentProps: {
      options: [
        { label: "PNG（无损）", value: "png" },
        { label: "JPEG（压缩）", value: "jpeg" }
      ]
    }
  },
  {
    field: "groupManager.summary.render.quality",
    label: "JPEG 质量",
    helpMessage: "JPEG 格式的图片质量（仅 jpeg 格式有效）",
    component: "InputNumber",
    componentProps: {
      min: 1,
      max: 100,
      placeholder: "请输入质量 (1-100)"
    }
  },
  {
    component: "Divider",
    label: "话题分析"
  },
  {
    field: "groupManager.analysis.topic.enabled",
    label: "启用话题分析",
    helpMessage: "是否启用群聊话题分析功能",
    component: "Switch"
  },
  {
    component: "Divider",
    label: "金句提取"
  },
  {
    field: "groupManager.analysis.goldenQuote.enabled",
    label: "启用金句提取",
    helpMessage: "是否启用群聊金句提取功能",
    component: "Switch"
  },
  {
    field: "groupManager.analysis.goldenQuote.max_golden_quotes",
    label: "最多提取金句数",
    helpMessage: "每次分析最多提取的金句数量",
    component: "InputNumber",
    componentProps: {
      min: 1,
      max: 20,
      placeholder: "请输入金句数量 (1-20条)"
    }
  },
  {
    field: "groupManager.analysis.goldenQuote.min_quote_length",
    label: "金句最短长度",
    helpMessage: "金句的最小字符数",
    component: "InputNumber",
    componentProps: {
      min: 1,
      max: 50,
      placeholder: "请输入最短长度 (1-50字符)"
    }
  },
  {
    field: "groupManager.analysis.goldenQuote.max_quote_length",
    label: "金句最长长度",
    helpMessage: "金句的最大字符数",
    component: "InputNumber",
    componentProps: {
      min: 10,
      max: 500,
      placeholder: "请输入最长长度 (10-500字符)"
    }
  },
  {
    component: "Divider",
    label: "用户称号"
  },
  {
    field: "groupManager.analysis.userTitle.enabled",
    label: "启用用户称号",
    helpMessage: "是否启用用户称号分配功能",
    component: "Switch"
  },
  {
    field: "groupManager.analysis.userTitle.max_user_titles",
    label: "最多分配称号数",
    helpMessage: "最多为多少个用户分配称号",
    component: "InputNumber",
    componentProps: {
      min: 1,
      max: 50,
      placeholder: "请输入称号数量 (1-50个)"
    }
  },
  {
    field: "groupManager.analysis.userTitle.min_messages_for_title",
    label: "获得称号最少消息数",
    helpMessage: "用户需要发送至少多少条消息才能获得称号",
    component: "InputNumber",
    componentProps: {
      min: 1,
      max: 100,
      placeholder: "请输入最少消息数 (1-100条)"
    }
  },
  {
    component: "Divider",
    label: "活跃度可视化"
  },
  {
    field: "groupManager.analysis.activity.enabled",
    label: "启用活跃度图表",
    helpMessage: "是否启用群聊活跃度热力图",
    component: "Switch"
  },
  {
    component: "Divider",
    label: "分析阈值"
  },
  {
    field: "groupManager.analysis.min_messages_threshold",
    label: "最少消息数阈值",
    helpMessage: "消息数少于此阈值时不执行 AI 分析",
    component: "InputNumber",
    componentProps: {
      min: 1,
      max: 500,
      placeholder: "请输入最少消息数 (1-500条)"
    }
  },
  {
    component: "Divider",
    label: "统计配置"
  },
  {
    field: "groupManager.statistics.night_start_hour",
    label: "夜间时段开始",
    helpMessage: "夜间时段的开始小时（24小时制）",
    component: "InputNumber",
    componentProps: {
      min: 0,
      max: 23,
      placeholder: "请输入开始小时 (0-23)"
    }
  },
  {
    field: "groupManager.statistics.night_end_hour",
    label: "夜间时段结束",
    helpMessage: "夜间时段的结束小时（24小时制）",
    component: "InputNumber",
    componentProps: {
      min: 0,
      max: 23,
      placeholder: "请输入结束小时 (0-23)"
    }
  }
]
