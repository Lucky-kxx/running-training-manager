/** OpenRouter can replace the callback's query with its own code and state. */
export function isOpenRouterReturn(params: URLSearchParams) {
  return (
    params.has('openrouter_return') ||
    (params.has('code') && params.has('state'))
  );
}
