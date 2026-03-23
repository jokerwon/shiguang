export const IntentType = {
  ADD_INGREDIENT: 'ADD_INGREDIENT',
  CONSUME_INGREDIENT: 'CONSUME_INGREDIENT',
  LOG_MEAL: 'LOG_MEAL',
  RECOMMEND_MEAL: 'RECOMMEND_MEAL',
  CHECK_STOCK: 'CHECK_STOCK',
  QUERY_PREFERENCE: 'QUERY_PREFERENCE',
  CHITCHAT: 'CHITCHAT',
} as const

export type IntentType = (typeof IntentType)[keyof typeof IntentType]

export type IntentPayload = {
  type: IntentType
  confidence: number
  payload: unknown
}
