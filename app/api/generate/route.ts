import { NextResponse } from "next/server";
import { generatePersonas, PROVIDERS, type ProviderName } from "@/lib/providers";

export const runtime = "nodejs";

function isProvider(value: unknown): value is ProviderName {
  return typeof value === "string" && value in PROVIDERS;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!isProvider(body.provider)) {
      return NextResponse.json({ error: "Proveedor no soportado." }, { status: 400 });
    }
    if (!body.apiKey || typeof body.apiKey !== "string") {
      return NextResponse.json({ error: "Falta la API Key del proveedor." }, { status: 400 });
    }
    if (!body.userPrompt || typeof body.userPrompt !== "string") {
      return NextResponse.json({ error: "Falta el prompt de generación." }, { status: 400 });
    }
    const provider: ProviderName = body.provider;

    const result = await generatePersonas({
      provider,
      model: String(body.model || PROVIDERS[provider].models[0]),
      apiKey: body.apiKey,
      userPrompt: body.userPrompt,
      temperature: Number(body.temperature ?? 0.3),
      maxTokens: Number(body.maxTokens ?? 5000),
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo generar el resultado.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
