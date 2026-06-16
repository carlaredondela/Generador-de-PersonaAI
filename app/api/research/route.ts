import { NextResponse } from "next/server";
import type { BusinessData, TargetData } from "@/lib/persona";

export const runtime = "nodejs";

function buildQueries(business: BusinessData, target: TargetData) {
  const base = `${business.nombre} ${business.sector} ${target.region} ${target.tipoCliente}`.trim();
  return [
    `${base} tendencias mercado clientes 2026`,
    `${base} comportamiento de compra objeciones canales`,
    `${base} competidores posicionamiento precios ${business.competencia}`,
    `${base} marketing ventas SEO mensajes efectivos`,
  ];
}

async function tavilySearch(apiKey: string, query: string) {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: 3,
      include_answer: true,
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.error ?? json?.message ?? `Error HTTP ${response.status}`);
  }
  return json;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.apiKey || typeof body.apiKey !== "string") {
      return NextResponse.json({ error: "Falta la API Key de Tavily." }, { status: 400 });
    }
    const business = body.business as BusinessData;
    const target = body.target as TargetData;
    const queries = buildQueries(business, target);
    const blocks: string[] = [];
    const sources = new Set<string>();

    for (const query of queries) {
      const result = await tavilySearch(body.apiKey, query);
      if (result.answer) {
        blocks.push(`Consulta: ${query}\nResumen: ${result.answer}`);
      }
      for (const item of result.results ?? []) {
        if (item.url) sources.add(item.url);
        blocks.push(`Fuente: ${item.title ?? ""}\nURL: ${item.url ?? ""}\nExtracto: ${item.content ?? ""}`);
      }
    }

    return NextResponse.json({
      context: blocks.join("\n\n").slice(0, 16000),
      sources: Array.from(sources).sort(),
      searchCount: queries.length,
      queries,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo completar la investigación.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
