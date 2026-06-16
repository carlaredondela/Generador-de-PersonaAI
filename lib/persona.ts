export type BusinessData = {
  nombre: string;
  descripcion: string;
  sector: string;
  competencia: string;
  propuestaValor: string;
};

export type TargetData = {
  region: string;
  tipoCliente: "B2B" | "B2C" | "Ambos";
  madurez: string;
  profundidad: "Resumen rápido" | "Estándar" | "Completo";
  numeroPersonas: 1 | 3 | 5;
};

export type Persona = {
  nombre: string;
  resumen_ejecutivo: string;
  perfil_demografico: Record<string, unknown>;
  perfil_profesional: Record<string, unknown>;
  objetivos: string[];
  motivaciones: string[];
  frustraciones: string[];
  objeciones_compra: string[];
  comportamiento_digital: Record<string, unknown>;
  proceso_decision: string;
  mensajes_clave: string[];
  propuesta_valor: string;
  ideas_marketing: {
    contenidos: string[];
    anuncios: string[];
    seo_keywords: string[];
    ctas: string[];
  };
  nivel_confianza: string;
  justificacion: string;
};

export type PersonaResult = {
  buyer_personas: Persona[];
};

export const SYSTEM_PROMPT = `Eres un Director de Marketing Estratégico, Growth Marketing, Investigación de Mercados y Psicología del Consumidor con más de 20 años de experiencia.

Tu misión es construir Buyer Personas extremadamente útiles y accionables. Evita perfiles genéricos. Evita estereotipos. No inventes datos específicos sin indicarlo.

Prioriza siempre comportamiento, motivaciones, objeciones y contexto de compra frente a simples datos demográficos. Todas las conclusiones deben estar justificadas por la información disponible. Cuando la información sea insuficiente, indícalo explícitamente. Razona de forma estratégica como si asesoraras a una empresa real.

Cada Buyer Persona debe ser útil para: Marketing, Publicidad, Ventas, Contenido, SEO, Posicionamiento y Diseño de producto.

Antes de generar el resultado final: analiza toda la información recibida, identifica patrones relevantes, evalúa el nivel de confianza de cada conclusión y genera un perfil coherente y accionable.

Devuelve EXCLUSIVAMENTE un objeto JSON válido que cumpla el esquema indicado. No incluyas texto fuera del JSON, ni Markdown, ni explicaciones adicionales.`;

export const JSON_SCHEMA_EXAMPLE = {
  buyer_personas: [
    {
      nombre: "",
      resumen_ejecutivo: "",
      perfil_demografico: {
        edad_estimada: "",
        educacion: "",
        ingresos: "",
        localizacion: "",
      },
      perfil_profesional: {
        cargo: "",
        responsabilidades: "",
        poder_decision: "",
      },
      objetivos: [],
      motivaciones: [],
      frustraciones: [],
      objeciones_compra: [],
      comportamiento_digital: {
        redes: [],
        canales: [],
        formatos: [],
        dispositivos: [],
      },
      proceso_decision: "",
      mensajes_clave: [],
      propuesta_valor: "",
      ideas_marketing: {
        contenidos: [],
        anuncios: [],
        seo_keywords: [],
        ctas: [],
      },
      nivel_confianza: "",
      justificacion: "",
    },
  ],
};

const REQUIRED_PERSONA_KEYS = [
  "nombre",
  "resumen_ejecutivo",
  "perfil_demografico",
  "perfil_profesional",
  "objetivos",
  "motivaciones",
  "frustraciones",
  "objeciones_compra",
  "comportamiento_digital",
  "proceso_decision",
  "mensajes_clave",
  "propuesta_valor",
  "ideas_marketing",
  "nivel_confianza",
  "justificacion",
] as const;

const REQUIRED_IDEAS_KEYS = ["contenidos", "anuncios", "seo_keywords", "ctas"] as const;

export function buildUserPrompt(
  business: BusinessData,
  target: TargetData,
  extraContext: string,
  researchContext: string,
  sources: string[],
) {
  const payload = {
    datos_del_negocio: business,
    mercado_objetivo: target,
    contexto_adicional: extraContext.trim() || "No aportado.",
    investigacion_de_mercado: researchContext.trim() || "No aportada.",
    fuentes_detectadas: sources,
  };

  return `Genera Buyer Personas accionables para el siguiente caso.

Datos disponibles:
${JSON.stringify(payload, null, 2)}

Instrucciones específicas:
- Genera exactamente ${target.numeroPersonas} Buyer Persona(s).
- Ajusta la profundidad al nivel indicado: ${target.profundidad}.
- Distingue en la justificación qué proviene de investigación web/pegada y qué es inferencia estratégica.
- Si no hay datos suficientes para una conclusión, dilo explícitamente.
- Para cada persona, entrega 5 ideas de contenido, 5 anuncios, 5 keywords SEO y 5 CTAs cuando sea razonable.
- Usa "Alto", "Medio" o "Bajo" en nivel_confianza.

Esquema JSON obligatorio:
${JSON.stringify(JSON_SCHEMA_EXAMPLE, null, 2)}

Responde solo con un objeto JSON válido. No uses Markdown. No incluyas texto antes ni después del JSON.`;
}

export function buildManualPrompt(userPrompt: string) {
  return `${SYSTEM_PROMPT}

Ahora actúa sobre esta solicitud completa:

${userPrompt}

Recordatorio final obligatorio:
Devuelve exclusivamente un objeto JSON válido que respete todas las claves del esquema. No incluyas explicaciones, saludos, comentarios, Markdown ni vallas de código.`;
}

export function buildResearchPrompt(business: BusinessData, target: TargetData) {
  return `Investiga el mercado para crear Buyer Personas accionables.

Datos del negocio:
- Producto/servicio: ${business.nombre}
- Descripción: ${business.descripcion}
- Sector: ${business.sector}
- Competencia: ${business.competencia}
- Propuesta de valor: ${business.propuestaValor}

Mercado objetivo:
- Región: ${target.region}
- Tipo de cliente: ${target.tipoCliente}
- Nivel de madurez: ${target.madurez}

Busca y resume:
1. Tendencias del sector y del mercado.
2. Competidores y posicionamiento.
3. Comportamiento del cliente, canales y formatos de contenido.
4. Objeciones habituales, criterios de compra y sensibilidad a precio.
5. Oportunidades de mensajes, SEO y anuncios.

Incluye fuentes y URLs. No inventes datos específicos sin fuente.`;
}

export function extractUrls(text: string) {
  return Array.from(new Set(text.match(/https?:\/\/[^\s\]\)>,"']+/g) ?? [])).sort();
}

export function extractJson(text: string): unknown {
  if (!text.trim()) {
    throw new Error("La respuesta está vacía.");
  }
  let cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("No se detecta un objeto JSON. Pide a la IA externa que responda solo con JSON válido.");
  }
  cleaned = cleaned.slice(first, last + 1);
  try {
    return JSON.parse(cleaned);
  } catch {
    const noTrailingCommas = cleaned.replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(noTrailingCommas);
    } catch (error) {
      const message = error instanceof Error ? error.message : "error desconocido";
      throw new Error(`El JSON no se puede leer: ${message}. Pide que lo devuelva solo en JSON, sin Markdown ni comas sobrantes.`);
    }
  }
}

export function validatePersonas(data: unknown): PersonaResult {
  if (!data || typeof data !== "object") {
    throw new Error("La respuesta debe ser un objeto JSON.");
  }
  const root = data as Record<string, unknown>;
  if (!Array.isArray(root.buyer_personas) || root.buyer_personas.length === 0) {
    throw new Error("Falta la clave obligatoria 'buyer_personas' como lista con al menos un elemento.");
  }

  const errors: string[] = [];
  root.buyer_personas.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      errors.push(`la persona #${index + 1} no es un objeto`);
      return;
    }
    const persona = item as Record<string, unknown>;
    const missing = REQUIRED_PERSONA_KEYS.filter((key) => !(key in persona));
    if (missing.length) {
      errors.push(`a la persona #${index + 1} le faltan las claves: ${missing.join(", ")}`);
    }
    const ideas = persona.ideas_marketing;
    if (!ideas || typeof ideas !== "object") {
      errors.push(`a la persona #${index + 1} le falta ideas_marketing como objeto`);
      return;
    }
    const missingIdeas = REQUIRED_IDEAS_KEYS.filter((key) => !(key in (ideas as Record<string, unknown>)));
    if (missingIdeas.length) {
      errors.push(`a la persona #${index + 1} le faltan ideas_marketing: ${missingIdeas.join(", ")}`);
    }
  });

  if (errors.length) {
    throw new Error(
      `El JSON no respeta el esquema: ${errors.join("; ")}. Pide: "devuélvemelo solo en JSON, respetando todas las claves".`,
    );
  }
  return root as PersonaResult;
}

function listLines(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (value && typeof value === "object") {
    return Object.entries(value).map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(", ") : String(val)}`);
  }
  if (value === undefined || value === null || value === "") return ["No especificado."];
  return [String(value)];
}

function section(title: string, value: unknown) {
  const lines = listLines(value);
  if (lines.length === 1 && lines[0] === "No especificado.") {
    return `### ${title}\n\nNo especificado.\n`;
  }
  return `### ${title}\n\n${lines.map((line) => `- ${line}`).join("\n")}\n`;
}

export function personasToMarkdown(data: PersonaResult, sources: string[] = []) {
  const chunks = ["# Buyer Personas\n"];
  data.buyer_personas.forEach((persona, index) => {
    chunks.push(`## ${index + 1}. ${persona.nombre || "Buyer Persona"}\n`);
    chunks.push(section("Resumen ejecutivo", persona.resumen_ejecutivo));
    chunks.push(section("Perfil demográfico", persona.perfil_demografico));
    chunks.push(section("Perfil profesional", persona.perfil_profesional));
    chunks.push(section("Objetivos", persona.objetivos));
    chunks.push(section("Motivaciones", persona.motivaciones));
    chunks.push(section("Frustraciones", persona.frustraciones));
    chunks.push(section("Objeciones de compra", persona.objeciones_compra));
    chunks.push(section("Comportamiento digital", persona.comportamiento_digital));
    chunks.push(section("Proceso de decisión", persona.proceso_decision));
    chunks.push(section("Mensajes más efectivos", persona.mensajes_clave));
    chunks.push(section("Propuesta de valor recomendada", persona.propuesta_valor));
    chunks.push(section("Ideas de marketing", persona.ideas_marketing));
    chunks.push(section("Nivel de confianza", persona.nivel_confianza));
    chunks.push(section("Justificación", persona.justificacion));
  });
  if (sources.length) {
    chunks.push("## Fuentes\n");
    chunks.push(sources.map((source) => `- ${source}`).join("\n"));
  }
  return chunks.join("\n");
}
