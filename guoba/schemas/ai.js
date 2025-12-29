export default [
  {
    component: "SOFT_GROUP_BEGIN",
    label: "AI 配置"
  },
  {
    field: "groupManager.ai.apiKey",
    label: "API Key",
    helpMessage: "支持所有兼容 OpenAI API 格式的服务商",
    component: "Input",
    componentProps: {
      type: "password",
      placeholder: "请输入 API Key"
    }
  },
  {
    field: "groupManager.ai.model",
    label: "模型名称",
    helpMessage: "AI 模型的名称",
    component: "Input",
    componentProps: {
      placeholder: "例如: gpt-5.2, claude-4-5-sonnet"
    }
  },
  {
    field: "groupManager.ai.baseURL",
    label: "API 地址",
    helpMessage: "API 的基础 URL 地址",
    component: "Input",
    componentProps: {
      placeholder: "例如: https://api.openai.com/v1"
    }
  },
  {
    field: "groupManager.ai.timeout",
    label: "超时时间（毫秒）",
    helpMessage: "API 请求的超时时间",
    component: "InputNumber",
    componentProps: {
      min: 10000,
      max: 300000,
      step: 1000,
      placeholder: "请输入超时时间 (10000-300000毫秒)"
    }
  },
  {
    field: "groupManager.ai.maxTokens",
    label: "最大 Token 数",
    helpMessage: "AI 响应的最大 Token 数量",
    component: "InputNumber",
    componentProps: {
      min: 1000,
      max: 100000,
      step: 1000,
      placeholder: "请输入最大 Token 数"
    }
  },
  {
    field: "groupManager.ai.maxMessages",
    label: "最大消息处理数",
    helpMessage: "每次总结最多处理的消息数量",
    component: "InputNumber",
    componentProps: {
      min: 100,
      max: 10000,
      step: 100,
      placeholder: "请输入最大消息数"
    }
  },
  {
    field: "groupManager.ai.llm_timeout",
    label: "LLM 请求超时（秒）",
    helpMessage: "LLM 请求的超时时间",
    component: "InputNumber",
    componentProps: {
      min: 10,
      max: 600,
      placeholder: "请输入超时时间 (10-600秒)"
    }
  },
  {
    field: "groupManager.ai.llm_retries",
    label: "LLM 重试次数",
    helpMessage: "LLM 请求失败时的重试次数",
    component: "InputNumber",
    componentProps: {
      min: 0,
      max: 10,
      placeholder: "请输入重试次数 (0-10次)"
    }
  },
  {
    field: "groupManager.ai.llm_backoff",
    label: "重试退避时间（秒）",
    helpMessage: "两次重试之间的等待时间",
    component: "InputNumber",
    componentProps: {
      min: 1,
      max: 60,
      placeholder: "请输入退避时间 (1-60秒)"
    }
  }
]
