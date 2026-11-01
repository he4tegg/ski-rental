import Anthropic from '@anthropic-ai/sdk';

// Integracje AI za interfejsami z rozdziału 5.3: zmiana dostawcy = nowy adapter.

export interface DostawcaEmbeddingow {
  readonly model: string;
  osadz(teksty: string[]): Promise<number[][]>;
}

// Lokalny model bge-m3 (wielojęzyczny, 1024 wymiary) przez API Ollama.
export class OllamaEmbeddingAdapter implements DostawcaEmbeddingow {
  readonly model = process.env.EMBEDDING_MODEL ?? 'bge-m3';
  private url = process.env.OLLAMA_URL ?? 'http://localhost:11434';

  async osadz(teksty: string[]): Promise<number[][]> {
    const wynik: number[][] = [];
    for (let i = 0; i < teksty.length; i += 100) {
      const res = await fetch(`${this.url}/api/embed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.model, input: teksty.slice(i, i + 100) }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`Embeddingi: HTTP ${res.status} ${await res.text()}`);
      wynik.push(...((await res.json()) as { embeddings: number[][] }).embeddings);
    }
    return wynik;
  }
}

export type WiadomoscLLM = Anthropic.Beta.Messages.BetaMessageParam;
export type NarzedzieLLM = Anthropic.Beta.Messages.BetaTool;
export type OdpowiedzLLM = Anthropic.Beta.Messages.BetaMessage;

export interface DostawcaLLM {
  // Jedna tura modelu ze strumieniem tekstu; zwraca pełną wiadomość (z ewentualnym wywołaniem narzędzia).
  tura(params: { system: string; messages: WiadomoscLLM[]; tools: NarzedzieLLM[] }, naTekst: (t: string) => void): Promise<OdpowiedzLLM>;
}

export class ClaudeApiAdapter implements DostawcaLLM {
  private client = new Anthropic({ timeout: 30_000, maxRetries: 1 });
  private model = process.env.LLM_MODEL ?? 'claude-opus-5-5';

  async tura(params: { system: string; messages: WiadomoscLLM[]; tools: NarzedzieLLM[] }, naTekst: (t: string) => void) {
    // fallbacks: przy odmowie filtra bezpieczeństwa API samo ponawia na zapasowym modelu.
    const stream = this.client.beta.messages.stream({
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      model: this.model,
      max_tokens: 4000,
      output_config: { effort: 'low' },
      system: params.system,
      messages: params.messages,
      tools: params.tools,
    });
    stream.on('text', naTekst);
    return stream.finalMessage();
  }
}

type WiadomoscOllama = { role: string; content: string; tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[] };

// Lokalny model przez Ollama: tłumaczy format wiadomości i narzędzi Claude API na /api/chat Ollamy i z powrotem.
export class OllamaLLMAdapter implements DostawcaLLM {
  private url = process.env.OLLAMA_LLM_URL || process.env.OLLAMA_URL || 'http://localhost:11434';
  constructor(private model: string) {}

  async tura(params: { system: string; messages: WiadomoscLLM[]; tools: NarzedzieLLM[] }, naTekst: (t: string) => void) {
    const messages: WiadomoscOllama[] = [{ role: 'system', content: params.system }];
    for (const m of params.messages) {
      if (typeof m.content === 'string') {
        messages.push({ role: m.role, content: m.content });
        continue;
      }
      const bloki = m.content as any[];
      const tekst = bloki.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const wywolania = bloki.filter((b) => b.type === 'tool_use').map((b) => ({ function: { name: b.name, arguments: b.input } }));
      const wyniki = bloki.filter((b) => b.type === 'tool_result');
      if (wyniki.length) wyniki.forEach((b) => messages.push({ role: 'tool', content: String(b.content) }));
      else messages.push({ role: m.role, content: tekst, ...(wywolania.length && { tool_calls: wywolania }) });
    }

    const res = await fetch(`${this.url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: true,
        options: { temperature: 0.2 },
        tools: params.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })),
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok || !res.body) throw new Error(`Ollama: HTTP ${res.status} ${await res.text()}`);

    let tekst = '';
    let bufor = '';
    const wywolania: NonNullable<WiadomoscOllama['tool_calls']> = [];
    const usage = { input_tokens: 0, output_tokens: 0 };
    for await (const kawalek of res.body.pipeThrough(new TextDecoderStream())) {
      bufor += kawalek;
      const linie = bufor.split('\n');
      bufor = linie.pop()!;
      for (const linia of linie.filter(Boolean)) {
        const d = JSON.parse(linia);
        if (d.message?.content) {
          tekst += d.message.content;
          naTekst(d.message.content);
        }
        if (d.message?.tool_calls) wywolania.push(...d.message.tool_calls);
        if (d.done) Object.assign(usage, { input_tokens: d.prompt_eval_count ?? 0, output_tokens: d.eval_count ?? 0 });
      }
    }
    return {
      stop_reason: wywolania.length ? 'tool_use' : 'end_turn',
      content: [
        ...(tekst ? [{ type: 'text', text: tekst }] : []),
        ...wywolania.map((w, i) => ({ type: 'tool_use', id: `ollama_${Date.now()}_${i}`, name: w.function.name, input: w.function.arguments })),
      ],
      usage,
    } as unknown as OdpowiedzLLM;
  }
}

// Claude API, gdy jest klucz; inaczej lokalny model z Ollamy, gdy ustawiony; bez obu asystent zwraca same fragmenty artykułów.
export function wybierzLLM(): DostawcaLLM | null {
  if (process.env.ANTHROPIC_API_KEY) return new ClaudeApiAdapter();
  if (process.env.OLLAMA_LLM_MODEL) return new OllamaLLMAdapter(process.env.OLLAMA_LLM_MODEL);
  return null;
}
