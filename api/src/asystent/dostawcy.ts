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

export const llmDostepny = () => Boolean(process.env.ANTHROPIC_API_KEY);
