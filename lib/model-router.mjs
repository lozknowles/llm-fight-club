const clean = value => String(value || '').replace(/[\u0000-\u001f]/g, ' ').trim();
export class ModelRouter {
  constructor({ defaultBaseUrl, routes = {}, timeoutMs = 90000, apiKeys = {} }) {
    this.defaultBaseUrl = defaultBaseUrl.replace(/\/$/, ''); this.routes = routes; this.timeoutMs = timeoutMs; this.apiKeys = apiKeys;
    for (const [model, key] of Object.entries(apiKeys)) {
      if (key && new URL(routes[model] || this.defaultBaseUrl).protocol !== 'https:') throw Error('Cloud model credentials require HTTPS');
    }
  }
  async generate({ model, system, user, exact = false }) {
    const baseUrl = (this.routes[model] || this.defaultBaseUrl).replace(/\/$/, '');
    const headers = { 'content-type': 'application/json' }, body = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: .82, max_tokens: 220 };
    if (this.apiKeys[model]) headers.authorization = `Bearer ${this.apiKeys[model]}`;
    if (new URL(baseUrl).hostname !== 'api.openai.com') body.chat_template_kwargs = { enable_thinking: false };
    const started = performance.now();
    const response = await fetch(`${baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs) });
    if (!response.ok) throw Error(`Model provider HTTP ${response.status}`);
    const data = await response.json(), raw = data.choices?.[0]?.message?.content, text = exact ? raw : clean(raw);
    if (typeof text !== 'string' || !text.trim()) throw Error('Model provider returned no spoken text');
    return { text, latencyMs: Math.round(performance.now() - started), usage: data.usage || null, provider: 'openai-compatible', model: exact ? data.model || model : model, baseUrl };
  }
}
