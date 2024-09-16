import { Hono } from 'hono'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

const app = new Hono()

const llm = new ChatOpenAI({
  configuration: {
    baseURL: 'https://closedai.imbytecat.com/v1',
  },
  apiKey: process.env['OPENAI_API_KEY'],
  model: 'gpt-4o-mini',
  temperature: 0,
})

const currencyConverterSchema = z.object({
  amount: z.number().describe('The amount of money you want to convert.'),
  source: z.string().describe('The source currency code in ISO 4217 format.'),
  target: z.string().describe('The target currency code in ISO 4217 format.'),
})

type ExchangeRateResponse = {
  result: string
  provider: string
  documentation: string
  terms_of_use: string
  time_last_update_unix: number
  time_last_update_utc: string
  time_next_update_unix: number
  time_next_update_utc: string
  time_eol_unix: number
  base_code: string
  rates: {
    [currencyCode: string]: number
  }
}

const currencyConverterTool = tool(
  async ({ amount, source, target }) => {
    const resp = await fetch(`https://open.er-api.com/v6/latest/${source}`)
    const data: ExchangeRateResponse = await resp.json()
    const result = amount * data.rates[target]
    return result.toFixed(2)
  },
  {
    name: 'currencyConverter',
    description: 'Converts an amount from one currency to another.',
    schema: currencyConverterSchema,
  },
)

const tools = [currencyConverterTool]
const llmWithTools = llm.bindTools(tools)

const toolsByName: Record<string, any> = {
  currencyConverter: currencyConverterTool,
}

app.get('/', async (c) => {
  let messages = [
    new HumanMessage({
      content:
        'How much is 114 bucks in yuan? And how much is 514 yen in yuan?',
    }),
  ]

  const aiMessage = await llmWithTools.invoke(messages)

  if (aiMessage.tool_calls) {
    for (const toolCall of aiMessage.tool_calls) {
      const selectedTool = toolsByName[toolCall.name]
      const toolMessage = await selectedTool.invoke(toolCall)
      messages.push(toolMessage)
    }
  }
  console.log(messages)

  return c.text(messages.map((it) => it.content.toString()).join('\n'))
})

export default {
  fetch: app.fetch,
  port: 8080,
}
