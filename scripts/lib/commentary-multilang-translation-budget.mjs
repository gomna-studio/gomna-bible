/**
 * Shared hard ceiling for real network translation calls.
 * Counts initial requests, validation retries, partial retries,
 * content_filter fallbacks, and alternate-model fallbacks.
 */

export function createApiCallBudget(maxApiCalls) {
  const max = Number(maxApiCalls);
  if (!Number.isFinite(max) || max < 0) {
    throw new Error(`invalid maxApiCalls: ${maxApiCalls}`);
  }
  let remaining = max;
  let consumed = 0;

  return {
    get max() {
      return max;
    },
    get remaining() {
      return remaining;
    },
    get consumed() {
      return consumed;
    },
    /**
     * Atomically consume one call slot. Returns false when exhausted.
     * Safe under concurrent await interleaving because the check/decrement
     * is synchronous on the JS event loop.
     */
    tryConsume(count = 1) {
      const n = Number(count);
      if (!Number.isFinite(n) || n <= 0) return false;
      if (remaining < n) return false;
      remaining -= n;
      consumed += n;
      return true;
    },
    assertAvailable(count = 1) {
      if (this.tryConsume(count)) return true;
      const error = new Error(
        `max-api-calls exceeded: consumed=${consumed} max=${max}`,
      );
      error.code = 'max_api_calls_exceeded';
      error.retryable = false;
      throw error;
    },
  };
}

export function wrapProviderWithBudget(provider, budget) {
  if (!provider || typeof provider.complete !== 'function') {
    throw new Error('provider.complete is required');
  }
  if (!budget || typeof budget.tryConsume !== 'function') {
    throw new Error('budget is required');
  }
  return {
    ...provider,
    async complete(request = {}) {
      return provider.complete({
        ...request,
        budget,
      });
    },
  };
}
