import { describe, expect, it } from 'vitest'
import {
  parseAIJsonResponse,
  validateAPIKey,
  type AIProvider,
} from './ai-provider'

describe('AI Provider Abstraction Layer', () => {
  describe('parseAIJsonResponse', () => {
    it('parses direct JSON response', () => {
      const jsonString = '{"summary": "テスト要約", "followUpQuestions": ["質問1", "質問2"]}'
      const result = parseAIJsonResponse<{ summary: string; followUpQuestions: string[] }>(jsonString)

      expect(result.summary).toBe('テスト要約')
      expect(result.followUpQuestions).toHaveLength(2)
      expect(result.followUpQuestions[0]).toBe('質問1')
    })

    it('extracts JSON from markdown code blocks', () => {
      const markdownResponse = '```json\n{"summary": "マークダウンテスト", "count": 42}\n```'
      const result = parseAIJsonResponse<{ summary: string; count: number }>(markdownResponse)

      expect(result.summary).toBe('マークダウンテスト')
      expect(result.count).toBe(42)
    })

    it('extracts JSON from code blocks without language specifier', () => {
      const codeBlockResponse = '```\n{"name": "test", "value": true}\n```'
      const result = parseAIJsonResponse<{ name: string; value: boolean }>(codeBlockResponse)

      expect(result.name).toBe('test')
      expect(result.value).toBe(true)
    })

    it('extracts JSON object from mixed content', () => {
      const mixedResponse = 'Here is the result:\n{"status": "success", "data": [1, 2, 3]}\nEnd of response.'
      const result = parseAIJsonResponse<{ status: string; data: number[] }>(mixedResponse)

      expect(result.status).toBe('success')
      expect(result.data).toEqual([1, 2, 3])
    })

    it('handles nested JSON objects', () => {
      const nestedJson = JSON.stringify({
        outer: {
          inner: {
            value: 'nested'
          }
        },
        array: [{ id: 1 }, { id: 2 }]
      })
      const result = parseAIJsonResponse<{
        outer: { inner: { value: string } }
        array: { id: number }[]
      }>(nestedJson)

      expect(result.outer.inner.value).toBe('nested')
      expect(result.array).toHaveLength(2)
    })

    it('throws error when no valid JSON is found', () => {
      const invalidResponse = 'This is not JSON at all'

      expect(() => {
        parseAIJsonResponse(invalidResponse)
      }).toThrow('Could not parse JSON from AI response')
    })

    it('throws error on malformed JSON', () => {
      const malformedJson = '{"incomplete": "json"'

      expect(() => {
        parseAIJsonResponse(malformedJson)
      }).toThrow()
    })
  })

  describe('validateAPIKey', () => {
    it('does not throw when API key is provided for Gemini', () => {
      expect(() => {
        validateAPIKey('AIza_test_key_123', 'gemini')
      }).not.toThrow()
    })

    it('does not throw when API key is provided for Claude', () => {
      expect(() => {
        validateAPIKey('sk-ant-test-key-123', 'claude')
      }).not.toThrow()
    })

    it('does not throw when API key is provided for ChatGPT', () => {
      expect(() => {
        validateAPIKey('sk-test-key-123', 'chatgpt')
      }).not.toThrow()
    })

    it('throws error when Gemini API key is missing', () => {
      expect(() => {
        validateAPIKey(undefined, 'gemini')
      }).toThrow('Gemini API key is not configured')
    })

    it('throws error when Claude API key is missing', () => {
      expect(() => {
        validateAPIKey(undefined, 'claude')
      }).toThrow('Claude API key is not configured')
    })

    it('throws error when ChatGPT API key is missing', () => {
      expect(() => {
        validateAPIKey(undefined, 'chatgpt')
      }).toThrow('ChatGPT API key is not configured')
    })

    it('throws error when API key is empty string', () => {
      expect(() => {
        validateAPIKey('', 'gemini')
      }).toThrow('Gemini API key is not configured')
    })
  })

  describe('Provider type safety', () => {
    it('ensures AIProvider type only accepts valid providers', () => {
      const validProviders: AIProvider[] = ['gemini', 'claude', 'chatgpt']

      expect(validProviders).toHaveLength(3)
      expect(validProviders).toContain('gemini')
      expect(validProviders).toContain('claude')
      expect(validProviders).toContain('chatgpt')
    })
  })

  describe('JSON parsing edge cases', () => {
    it('handles JSON with Japanese characters', () => {
      const japaneseJson = '{"メッセージ": "こんにちは", "数値": 123}'
      const result = parseAIJsonResponse<{ メッセージ: string; 数値: number }>(japaneseJson)

      expect(result.メッセージ).toBe('こんにちは')
      expect(result.数値).toBe(123)
    })

    it('handles JSON with escape sequences', () => {
      const escapedJson = '{"text": "Line 1\\nLine 2\\tTabbed", "quote": "He said \\"hello\\""}'
      const result = parseAIJsonResponse<{ text: string; quote: string }>(escapedJson)

      expect(result.text).toBe('Line 1\nLine 2\tTabbed')
      expect(result.quote).toBe('He said "hello"')
    })

    it('handles empty arrays and objects', () => {
      const emptyStructures = '{"emptyArray": [], "emptyObject": {}, "nullValue": null}'
      const result = parseAIJsonResponse<{
        emptyArray: unknown[]
        emptyObject: Record<string, unknown>
        nullValue: null
      }>(emptyStructures)

      expect(result.emptyArray).toEqual([])
      expect(result.emptyObject).toEqual({})
      expect(result.nullValue).toBeNull()
    })

    it('extracts JSON with whitespace variations', () => {
      const whitespaceJson = `
        {
          "key1"  :  "value1"  ,
          "key2"  :  42
        }
      `
      const result = parseAIJsonResponse<{ key1: string; key2: number }>(whitespaceJson)

      expect(result.key1).toBe('value1')
      expect(result.key2).toBe(42)
    })
  })
})
