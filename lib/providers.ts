import { SYSTEM_PROMPT, extractJson, validatePersonas } from "./persona";

export const PROVIDERS = {
  OpenAI: {
    models: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini"],
    supportsJsonMode: true,
  },
  Anthropic: {
    models: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"],
    supportsJsonMode: false,
  },
  Google: {
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    supportsJsonMode: true,
  },
  Mistral: {
    models: ["mistral-large-latest", "mistral-small-latest"],
    supportsJsonMode: true,
  },
  Groq: {
    models: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"],
    supportsJsonMode: true,
  },
} as const;

export type ProviderName = keyof typeof PROVIDERS;

type GenerateInput = {
  provider: ProviderName;
  model: string;
  apiKey: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
};

type ProviderResponse = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};

async function postJson(url: string, apiKey: string, body: unknown, extraHeaders: Record<string, string> = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof json?.error?.message === "string"
        ? json.error.message
        : typeof json?.message === "string"
          ? json.message
          : `Error HTTP ${response.status}`;
    throw new Error(message);
  }
  return json;
}

function chatBody(model: string, userPrompt: string, temperature: number, maxTokens: number, jsonMode: boolean) {
  return {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature,
    max_tokens: maxTokens,
    ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
  };
}

async function openAiCompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number,
  jsonMode: boolean,
): Promise<ProviderResponse> {
  const json = await postJson(
    `${baseUrl}/chat/completions`,
    apiKey,
    chatBody(model, userPrompt, temperature, maxTokens, jsonMode),
  );
  return {
    text: json.choices?.[0]?.message?.content ?? "",
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
  };
}

async function anthropic(input: GenerateInput): Promise<ProviderResponse> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: input.model,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: input.userPrompt }],
      temperature: input.temperature,
      max_tokens: input.maxTokens,
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.error?.message ?? `Error HTTP ${response.status}`);
  }
  return {
    text: json.content?.map((part: { text?: string }) => part.text ?? "").join("") ?? "",
    inputTokens: json.usage?.input_tokens ?? 0,
    outputTokens: json.usage?.output_tokens ?? 0,
  };
}

async function google(input: GenerateInput): Promise<ProviderResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent?key=${encodeURIComponent(input.apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: input.userPrompt }] }],
      generationConfig: {
        temperature: input.temperature,
        maxOutputTokens: input.maxTokens,
        responseMimeType: "application/json",
      },
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.error?.message ?? `Error HTTP ${response.status}`);
  }
  return {
    text: json.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("") ?? "",
    inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

async function callProvider(input: GenerateInput): Promise<ProviderResponse> {
  if (input.provider === "OpenAI") {
    return openAiCompatible("https://api.openai.com/v1", input.apiKey, input.model, input.userPrompt, input.temperature, input.maxTokens, true);
  }
  if (input.provider === "Groq") {
    return openAiCompatible("https://api.groq.com/openai/v1", input.apiKey, input.model, input.userPrompt, input.temperature, input.maxTokens, true);
  }
  if (input.provider === "Mistral") {
    return openAiCompatible("https://api.mistral.ai/v1", input.apiKey, input.model, input.userPrompt, input.temperature, input.maxTokens, true);
  }
  if (input.provider === "Anthropic") {
    return anthropic(input);
  }
  return google(input);
}

export async function generatePersonas(input: GenerateInput) {
  const first = await callProvider(input);
  try {
    const data = validatePersonas(extractJson(first.text));
    return {
      data,
      usage: { inputTokens: first.inputTokens, outputTokens: first.outputTokens, cost: 0 },
      raw: first.text,
    };
  } catch (error) {
    const repairMessage = error instanceof Error ? error.message : "JSON inválido";
    const repaired = await callProvider({
      ...input,
      userPrompt: `${input.userPrompt}

La respuesta anterior no era válida. Error detectado: ${repairMessage}

Respuesta anterior:
${first.text}

Corrige y devuelve únicamente JSON válido con todas las claves obligatorias.`,
    });
    const data = validatePersonas(extractJson(repaired.text));
    return {
      data,
      usage: {
        inputTokens: first.inputTokens + repaired.inputTokens,
        outputTokens: first.outputTokens + repaired.outputTokens,
        cost: 0,
      },
      raw: repaired.text,
    };
  }
}
