import { tool } from 'ai'
import z from 'zod'

export const weatherTool = tool({
  description: '获取指定城市的天气信息',
  inputSchema: z.object({
    location: z.string().describe('The location to get the weather for'),
  }),
  execute: async ({ location }) => {
    const temperature = Math.round(Math.random() * (90 - 32) + 32)
    return {
      location,
      temperature,
    }
  },
})
