import { createAlibaba } from '@ai-sdk/alibaba'

export const model = createAlibaba({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
})(process.env.MODEL_NAME || 'qwen-coder-turbo')
