/**
 * AI Provider Abstraction Layer using LangChain
 * Supports Gemini, Claude (Sonnet 4.5), and ChatGPT (GPT-4o)
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAI } from '@langchain/openai'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'

export type AIProvider = 'gemini' | 'claude' | 'chatgpt'

export interface AIProviderConfig {
  provider: AIProvider
  apiKey: string
}

/**
 * Creates an AI model instance based on the provider configuration
 */
export function createAIModel(config: AIProviderConfig): BaseChatModel {
  const { provider, apiKey } = config

  switch (provider) {
    case 'gemini':
      return new ChatGoogleGenerativeAI({
        apiKey,
        model: 'gemini-2.5-flash',
        temperature: 0.7,
      })

    case 'claude':
      return new ChatAnthropic({
        apiKey,
        model: 'claude-sonnet-4-20250514',
        temperature: 0.7,
      })

    case 'chatgpt':
      return new ChatOpenAI({
        apiKey,
        model: 'gpt-4o',
        temperature: 0.7,
      })

    default:
      throw new Error(`Unsupported AI provider: ${provider}`)
  }
}

/**
 * Generate AI response using the specified provider
 */
export async function generateAIResponse(
  config: AIProviderConfig,
  prompt: string
): Promise<string> {
  const model = createAIModel(config)

  try {
    const response = await model.invoke(prompt)

    // Extract text content from the response
    if (typeof response.content === 'string') {
      return response.content
    }

    // Handle array content (concatenate all text parts)
    if (Array.isArray(response.content)) {
      return response.content
        .filter((part) => typeof part === 'string' || part.type === 'text')
        .map((part) => (typeof part === 'string' ? part : part.text))
        .join('')
    }

    throw new Error('Unexpected response format from AI model')
  } catch (error: any) {
    // Handle OpenAI quota/billing errors
    if (error.message && error.message.includes('exceeded your current quota')) {
      throw new Error(
        'OpenAI API の利用枠を超過しています。OpenAI Platform (https://platform.openai.com/account/billing) で支払い設定とクレジット残高を確認してください。'
      )
    }

    // Handle insufficient quota errors
    if (error.message && error.message.includes('InsufficientQuotaError')) {
      throw new Error(
        'OpenAI API の利用枠が不足しています。OpenAI Platform で支払い情報を設定するか、別のAIプロバイダー（Gemini、Claude）をご利用ください。'
      )
    }

    // Handle rate limit errors
    if (error.message && error.message.includes('429')) {
      throw new Error(
        'API のレート制限に達しました。しばらく待ってから再度お試しいただくか、別のAIプロバイダーをご利用ください。'
      )
    }

    // Handle model not found errors
    if (error.message && error.message.includes('404') && error.message.includes('model')) {
      throw new Error(
        `指定されたAIモデルが見つかりません。モデル名が正しいか確認してください。エラー詳細: ${error.message}`
      )
    }

    // Handle authentication errors
    if (error.message && (error.message.includes('401') || error.message.includes('authentication'))) {
      const providerNames = {
        gemini: 'Gemini',
        claude: 'Claude',
        chatgpt: 'OpenAI'
      }
      throw new Error(
        `${providerNames[config.provider]} API キーが無効です。設定画面で正しいAPIキーを設定してください。`
      )
    }

    // Re-throw the original error if not handled
    throw error
  }
}

/**
 * Parse JSON response from AI, with fallback extraction
 */
export function parseAIJsonResponse<T>(response: string): T {
  try {
    // Try direct JSON parse first
    return JSON.parse(response) as T
  } catch (e) {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]) as T
    }

    // Try to find any JSON object in the response
    const objectMatch = response.match(/\{[\s\S]*\}/)
    if (objectMatch) {
      return JSON.parse(objectMatch[0]) as T
    }

    throw new Error('Could not parse JSON from AI response')
  }
}

/**
 * Validate that an API key is configured for the specified provider
 */
export function validateAPIKey(apiKey: string | undefined, provider: AIProvider): void {
  if (!apiKey) {
    const providerNames = {
      gemini: 'Gemini',
      claude: 'Claude',
      chatgpt: 'ChatGPT'
    }
    throw new Error(
      `${providerNames[provider]} API key is not configured. Please set it in Settings.`
    )
  }
}
