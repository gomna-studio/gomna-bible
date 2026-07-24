/**
 * Translation provider adapters for commentary multilang v2 phase-3.
 * Separates network transport from batch planning / result splitting.
 * Never logs API keys.
 */

import {
  DEFAULT_TRANSLATION_MODEL,
  OPENAI_CHAT_COMPLETIONS_URL,
} from './commentary-multilang-translation.mjs';

export const PROVIDER_KIND_OPENAI = 'openai-chat-completions';
export const PROVIDER_KIND_MOCK = 'mock';

function redactSecrets(text) {
  return String(text || '')
    .replace(/sk-[A-Za-z0-9._-]+/g, '[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]');
}

export function resolveOpenAiApiKey(options = {}) {
  const fromOptions =
    typeof options.apiKey === 'string' && options.apiKey.trim()
      ? options.apiKey.trim()
      : '';
  const fromEnv =
    typeof process.env.OPENAI_API_KEY === 'string' &&
    process.env.OPENAI_API_KEY.trim()
      ? process.env.OPENAI_API_KEY.trim()
      : '';
  return fromOptions || fromEnv || null;
}

export function createOpenAiTranslationProvider(options = {}) {
  const apiKey = resolveOpenAiApiKey(options);
  const model = options.model || DEFAULT_TRANSLATION_MODEL;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const url = options.url || OPENAI_CHAT_COMPLETIONS_URL;

  return {
    kind: PROVIDER_KIND_OPENAI,
    model,
    hasApiKey: Boolean(apiKey),
    /**
     * Perform one chat completion. Throws on HTTP / empty content.
     * Rate-limit (429) errors include `statusCode` and `retryable`.
     */
    async complete({ systemPrompt, userContent, responseFormat, counters }) {
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is missing');
      }
      if (typeof fetchImpl !== 'function') {
        throw new Error('fetch is unavailable. Use Node.js 18 or newer.');
      }

      if (counters) {
        counters.attemptedCalls += 1;
        counters.totalCalls += 1;
      }

      const body = {
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      };
      if (responseFormat) {
        body.response_format = responseFormat;
      } else {
        body.response_format = { type: 'json_object' };
      }

      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        let summary = '';
        try {
          summary = redactSecrets(
            String((await response.text()) || '').slice(0, 400),
          );
        } catch {
          summary = '(unable to read error body)';
        }
        if (counters) counters.failedCalls += 1;
        const error = new Error(
          `OpenAI chat completion failed with HTTP ${response.status}`,
        );
        error.statusCode = response.status;
        error.retryable = response.status === 429 || response.status >= 500;
        error.details = summary;
        throw error;
      }

      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        if (counters) counters.failedCalls += 1;
        throw new Error('OpenAI chat completion returned empty content');
      }

      if (counters) counters.successfulCalls += 1;
      return {
        text: content,
        model: payload?.model || model,
        raw: payload,
      };
    },
  };
}

/**
 * Mock provider for unit tests. `handler({ systemPrompt, userContent })`
 * may return a string, `{ text, model }`, or throw.
 */
export function createMockTranslationProvider(options = {}) {
  const handler = options.handler;
  if (typeof handler !== 'function') {
    throw new Error('mock provider requires handler(fn)');
  }
  const model = options.model || 'mock-model';

  return {
    kind: PROVIDER_KIND_MOCK,
    model,
    hasApiKey: true,
    async complete(request) {
      if (request.counters) {
        request.counters.attemptedCalls += 1;
        request.counters.totalCalls += 1;
      }
      try {
        const result = await handler(request);
        const text =
          typeof result === 'string'
            ? result
            : result && typeof result.text === 'string'
              ? result.text
              : '';
        if (!text.trim()) {
          if (request.counters) request.counters.failedCalls += 1;
          throw new Error('Mock provider returned empty content');
        }
        if (request.counters) request.counters.successfulCalls += 1;
        return {
          text,
          model:
            result && typeof result === 'object' && result.model
              ? result.model
              : model,
          raw: result,
        };
      } catch (error) {
        if (request.counters) request.counters.failedCalls += 1;
        throw error;
      }
    },
  };
}

export function assertNoSecretLeak(text, apiKey = null) {
  const raw = String(text || '');
  if (/sk-[A-Za-z0-9]{10,}/.test(raw)) {
    throw new Error('Possible API key leaked into output');
  }
  if (apiKey && apiKey.length >= 8 && raw.includes(apiKey)) {
    throw new Error('API key value leaked into output');
  }
  return true;
}

export { redactSecrets };
