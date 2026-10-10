export const ALLOWED_MODELS = [
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "qwen/qwen3-next-80b-a3b-instruct:free"
];

export interface OpenRouterClientConfig {
  apiKey: string;
  referer: string;
  appName: string;
}

export interface RequestOptions {
  model: string;
  payload: any;
  timeoutMs?: number;
}

export class OpenRouterClient {
  private config: OpenRouterClientConfig;

  constructor() {
    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) {
      throw new Error("O serviço de leitura inteligente ainda não está configurado. OPENROUTER_API_KEY ausente.");
    }

    const referer = Deno.env.get("OPENROUTER_HTTP_REFERER") || "https://grupo-gsa.com.br";
    const appName = Deno.env.get("OPENROUTER_APP_NAME") || "Grupo GSA - Importador de Produtos";

    this.config = { apiKey, referer, appName };
  }

  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async request(options: RequestOptions): Promise<{ content: string; modelUsed: string; usage?: any }> {
    const { model, payload, timeoutMs = 60000 } = options;

    // Guardrail: Validate model is in allowlist
    if (!ALLOWED_MODELS.includes(model)) {
      throw new Error(`Modelo não autorizado pelo Guardrail da aplicação: ${model}`);
    }

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": this.config.referer,
      "X-Title": this.config.appName
    };

    let retries = 0;
    const maxRetries = 1;

    while (true) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers,
          body: JSON.stringify({
            model,
            ...payload
          }),
          signal: controller.signal
        });

        clearTimeout(id);

        if (response.status === 429) {
          if (retries < maxRetries) {
            retries++;
            // Exponential backoff with jitter
            const backoffMs = Math.pow(2, retries) * 1000 + Math.random() * 500;
            console.warn(`[OpenRouterClient] Rate limited (429). Retrying in ${backoffMs.toFixed(0)}ms...`);
            await this.delay(backoffMs);
            continue;
          }
          throw new Error("Limite de requisições excedido no provedor (429). Tente novamente mais tarde.");
        }

        if (!response.ok) {
          const text = await response.text();
          let parsedError = text;
          try {
            const errObj = JSON.parse(text);
            parsedError = errObj.error?.message || text;
          } catch {
            // keep raw text
          }
          throw new Error(`OpenRouter Error ${response.status}: ${parsedError}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        
        if (!content) {
          throw new Error("O modelo de IA retornou uma resposta vazia.");
        }

        return {
          content,
          modelUsed: data.model || model,
          usage: data.usage || null
        };

      } catch (error: any) {
        clearTimeout(id);
        
        if (error.name === "AbortError") {
          throw new Error(`Timeout de processamento excedido para o modelo ${model}.`);
        }

        if (retries < maxRetries && error.message?.includes("50")) {
          // Retry on 5xx temporary server errors
          retries++;
          const backoffMs = 1000 + Math.random() * 500;
          console.warn(`[OpenRouterClient] Temporary server error. Retrying in ${backoffMs.toFixed(0)}ms...`);
          await this.delay(backoffMs);
          continue;
        }

        throw error;
      }
    }
  }
}
