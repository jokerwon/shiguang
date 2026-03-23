import { createAlibaba } from '@ai-sdk/alibaba'

export const model = createAlibaba({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
})(process.env.MODEL_NAME || 'qwen-coder-turbo')

export const intentModel = createAlibaba({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
})(process.env.INTENT_MODEL_NAME!)
