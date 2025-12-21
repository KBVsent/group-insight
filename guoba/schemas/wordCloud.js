export default [
  {
    component: "SOFT_GROUP_BEGIN",
    label: "词云配置"
  },
  {
    field: "groupManager.wordCloud.maxWords",
    label: "最多显示词数",
    helpMessage: "词云中最多显示的词语数量",
    component: "InputNumber",
    componentProps: {
      min: 10,
      max: 500,
      placeholder: "请输入最多词数 (10-500个)"
    }
  },
  {
    field: "groupManager.wordCloud.minLength",
    label: "最短词长度",
    helpMessage: "词语的最小字符数（小于此长度的词会被过滤）",
    component: "InputNumber",
    componentProps: {
      min: 1,
      max: 10,
      placeholder: "请输入最短长度 (1-10字符)"
    }
  },
  {
    field: "groupManager.wordCloud.minFrequency",
    label: "最小词频",
    helpMessage: "词语的最小出现次数（低于此频率的词会被过滤）",
    component: "InputNumber",
    componentProps: {
      min: 1,
      max: 100,
      placeholder: "请输入最小词频 (1-100次)"
    }
  },
  {
    field: "groupManager.wordCloud.filterStrength",
    label: "词性过滤强度",
    helpMessage: "智能过滤停顿词、语气词等无意义词汇的强度",
    bottomHelpMessage: "loose-宽松 / standard-标准(推荐) / strict-严格",
    component: "RadioGroup",
    componentProps: {
      options: [
        { label: "宽松", value: "loose" },
        { label: "标准（推荐）", value: "standard" },
        { label: "严格", value: "strict" }
      ]
    }
  },
  {
    field: "groupManager.wordCloud.extractMethod",
    label: "关键词提取方式",
    helpMessage: "词云关键词的提取算法",
    bottomHelpMessage: "frequency-词频统计 / tfidf-TF-IDF算法（突出区分性词汇）",
    component: "RadioGroup",
    componentProps: {
      options: [
        { label: "词频统计", value: "frequency" },
        { label: "TF-IDF 算法", value: "tfidf" }
      ]
    }
  },
  {
    field: "groupManager.wordCloud.width",
    label: "画布宽度",
    helpMessage: "词云图片的宽度（像素）",
    component: "InputNumber",
    componentProps: {
      min: 400,
      max: 2400,
      step: 100,
      placeholder: "请输入宽度 (400-2400px)"
    }
  },
  {
    field: "groupManager.wordCloud.height",
    label: "画布高度",
    helpMessage: "词云图片的高度（像素）",
    component: "InputNumber",
    componentProps: {
      min: 300,
      max: 1800,
      step: 100,
      placeholder: "请输入高度 (300-1800px)"
    }
  },
  {
    field: "groupManager.wordCloud.backgroundColor",
    label: "背景颜色",
    helpMessage: "词云的背景颜色（十六进制色值）",
    component: "Input",
    componentProps: {
      placeholder: "例如: #ffffff"
    }
  },
  {
    component: "Divider",
    label: "渲染质量"
  },
  {
    field: "groupManager.wordCloud.render.imgType",
    label: "图片格式",
    helpMessage: "词云图片的输出格式",
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
    field: "groupManager.wordCloud.render.quality",
    label: "JPEG 质量",
    helpMessage: "JPEG 格式的图片质量（仅 jpeg 格式有效）",
    component: "InputNumber",
    componentProps: {
      min: 1,
      max: 100,
      placeholder: "请输入质量 (1-100)"
    }
  }
]
