"use client";

import { useMemo, useState } from "react";
import { Clipboard, Download, FileJson, FileText, Globe2, Play, Search, Sparkles } from "lucide-react";
import { jsPDF } from "jspdf";
import {
  buildManualPrompt,
  buildResearchPrompt,
  buildUserPrompt,
  extractJson,
  extractUrls,
  personasToMarkdown,
  validatePersonas,
  type BusinessData,
  type PersonaResult,
  type TargetData,
} from "@/lib/persona";
import { PROVIDERS, type ProviderName } from "@/lib/providers";

type Tab = "generar" | "resultados" | "guia";
type GenerationMode = "manual" | "api";
type ResearchMode = "manual" | "auto" | "none";

const emptyBusiness: BusinessData = {
  nombre: "",
  descripcion: "",
  sector: "",
  competencia: "",
  propuestaValor: "",
};

const defaultTarget: TargetData = {
  region: "España",
  tipoCliente: "B2B",
  madurez: "Busca soluciones",
  profundidad: "Estándar",
  numeroPersonas: 3,
};

function downloadFile(name: string, content: string | Blob, type: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

function exportPdf(markdown: string) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 42;
  const maxWidth = 511;
  let y = margin;
  markdown.split("\n").forEach((line) => {
    const clean = line.replace(/^#{1,3}\s*/, "").replace(/^-\s*/, "• ");
    if (!clean.trim()) {
      y += 8;
      return;
    }
    if (y > 780) {
      doc.addPage();
      y = margin;
    }
    const isTitle = line.startsWith("# ");
    const isHeading = line.startsWith("## ") || line.startsWith("### ");
    doc.setFont("helvetica", isTitle || isHeading ? "bold" : "normal");
    doc.setFontSize(isTitle ? 18 : isHeading ? 13 : 10);
    const lines = doc.splitTextToSize(clean, maxWidth);
    doc.text(lines, margin, y);
    y += lines.length * (isTitle ? 20 : 14) + 4;
  });
  doc.save("buyer-personas.pdf");
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("generar");
  const [generationMode, setGenerationMode] = useState<GenerationMode>("manual");
  const [researchMode, setResearchMode] = useState<ResearchMode>("manual");
  const [provider, setProvider] = useState<ProviderName>("OpenAI");
  const [model, setModel] = useState<string>(PROVIDERS.OpenAI.models[0]);
  const [apiKey, setApiKey] = useState("");
  const [tavilyKey, setTavilyKey] = useState("");
  const [temperature, setTemperature] = useState(0.3);
  const [maxTokens, setMaxTokens] = useState(5000);
  const [business, setBusiness] = useState<BusinessData>(emptyBusiness);
  const [target, setTarget] = useState<TargetData>(defaultTarget);
  const [extraContext, setExtraContext] = useState("");
  const [researchContext, setResearchContext] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [searchCount, setSearchCount] = useState(0);
  const [manualPrompt, setManualPrompt] = useState("");
  const [researchPrompt, setResearchPrompt] = useState("");
  const [pastedJson, setPastedJson] = useState("");
  const [result, setResult] = useState<PersonaResult | null>(null);
  const [usage, setUsage] = useState({ inputTokens: 0, outputTokens: 0, cost: 0 });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const userPrompt = useMemo(
    () => buildUserPrompt(business, target, extraContext, researchContext, sources),
    [business, target, extraContext, researchContext, sources],
  );
  const markdown = useMemo(() => (result ? personasToMarkdown(result, sources) : ""), [result, sources]);

  function updateBusiness<K extends keyof BusinessData>(key: K, value: BusinessData[K]) {
    setBusiness((current) => ({ ...current, [key]: value }));
  }

  function updateTarget<K extends keyof TargetData>(key: K, value: TargetData[K]) {
    setTarget((current) => ({ ...current, [key]: value }));
  }

  function changeProvider(next: ProviderName) {
    setProvider(next);
    setModel(PROVIDERS[next].models[0]);
  }

  async function readFiles(files: FileList | null) {
    if (!files?.length) return;
    const chunks: string[] = [];
    for (const file of Array.from(files)) {
      if (!/\.(txt|md|csv)$/i.test(file.name)) {
        chunks.push(`\n[${file.name}] No se leyó automáticamente. Para PDF o DOCX, pega el texto relevante en el campo de contexto.`);
        continue;
      }
      chunks.push(`\n[${file.name}]\n${await file.text()}`);
    }
    setExtraContext((current) => `${current}\n${chunks.join("\n\n")}`.trim());
  }

  async function runAutoResearch() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: tavilyKey, business, target }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "No se pudo investigar.");
      setResearchContext(json.context ?? "");
      setSources(json.sources ?? []);
      setSearchCount(json.searchCount ?? 0);
      setMessage("Investigación automática completada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo completar la investigación.");
    } finally {
      setBusy(false);
    }
  }

  function processManualJson() {
    setMessage("");
    try {
      const data = validatePersonas(extractJson(pastedJson));
      setResult(data);
      setUsage({ inputTokens: 0, outputTokens: 0, cost: 0 });
      setTab("resultados");
      setMessage("JSON procesado correctamente.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo procesar el JSON.");
    }
  }

  async function runApiGeneration() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, model, apiKey, userPrompt, temperature, maxTokens }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "No se pudo generar.");
      setResult(json.data);
      setUsage(json.usage ?? { inputTokens: 0, outputTokens: 0, cost: 0 });
      setTab("resultados");
      setMessage("Buyer Personas generados.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo generar el resultado.");
    } finally {
      setBusy(false);
    }
  }

  function syncManualResearch(text: string) {
    setResearchContext(text.slice(0, 14000));
    setSources(extractUrls(text));
    setSearchCount(0);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">PA</div>
          <h1>PersonaAI Generator</h1>
        </div>

        <section className="sidebar-section">
          <h2>IA</h2>
          <Field label="Modo de generación">
            <select className="select" value={generationMode} onChange={(event) => setGenerationMode(event.target.value as GenerationMode)}>
              <option value="manual">Manual · gratis</option>
              <option value="api">API · automático</option>
            </select>
          </Field>
          {generationMode === "manual" ? (
            <div className="status">Sin API Key. Copias el prompt, usas una IA externa y pegas aquí el JSON.</div>
          ) : (
            <>
              <Field label="Proveedor">
                <select className="select" value={provider} onChange={(event) => changeProvider(event.target.value as ProviderName)}>
                  {Object.keys(PROVIDERS).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Modelo">
                <select className="select" value={model} onChange={(event) => setModel(event.target.value)}>
                  {PROVIDERS[provider].models.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="API Key">
                <input className="input" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
              </Field>
              <Field label={`Temperatura ${temperature}`}>
                <input className="input" type="range" min="0" max="1" step="0.05" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} />
              </Field>
              <Field label={`Tokens ${maxTokens}`}>
                <input className="input" type="range" min="1000" max="12000" step="500" value={maxTokens} onChange={(event) => setMaxTokens(Number(event.target.value))} />
              </Field>
            </>
          )}
        </section>

        <section className="sidebar-section">
          <h2>Investigación</h2>
          <Field label="Modo">
            <select className="select" value={researchMode} onChange={(event) => setResearchMode(event.target.value as ResearchMode)}>
              <option value="manual">Manual asistida</option>
              <option value="auto">Automática con Tavily</option>
              <option value="none">Sin investigación</option>
            </select>
          </Field>
          {researchMode === "auto" ? (
            <>
              <Field label="API Key de Tavily">
                <input className="input" type="password" value={tavilyKey} onChange={(event) => setTavilyKey(event.target.value)} />
              </Field>
              <button className="btn primary" onClick={runAutoResearch} disabled={busy}>
                <Search size={17} /> Investigar
              </button>
            </>
          ) : null}
          {researchMode === "none" ? <div className="status warn">Más rápido, pero con menor confianza.</div> : null}
        </section>
      </aside>

      <section className="main">
        <div className="topbar">
          <h2>{tab === "generar" ? "Generar Buyer Personas" : tab === "resultados" ? "Resultados" : "Guía rápida"}</h2>
          <div className="tabs">
            <button className={`tab ${tab === "generar" ? "active" : ""}`} onClick={() => setTab("generar")}>
              <Sparkles size={16} /> Generar
            </button>
            <button className={`tab ${tab === "resultados" ? "active" : ""}`} onClick={() => setTab("resultados")}>
              <FileText size={16} /> Resultados
            </button>
            <button className={`tab ${tab === "guia" ? "active" : ""}`} onClick={() => setTab("guia")}>
              <Globe2 size={16} /> Guía
            </button>
          </div>
        </div>

        {message ? <p className={`status ${message.includes("correctamente") || message.includes("completada") || message.includes("generados") ? "ok" : ""}`}>{message}</p> : null}

        {tab === "generar" ? (
          <div className="grid">
            <section className="panel span-6">
              <h3>Datos del negocio</h3>
              <Field label="Nombre del producto o servicio">
                <input className="input" value={business.nombre} onChange={(event) => updateBusiness("nombre", event.target.value)} />
              </Field>
              <Field label="Sector o mercado">
                <input className="input" value={business.sector} onChange={(event) => updateBusiness("sector", event.target.value)} />
              </Field>
              <Field label="Competencia principal">
                <input className="input" value={business.competencia} onChange={(event) => updateBusiness("competencia", event.target.value)} />
              </Field>
              <Field label="Propuesta de valor">
                <input className="input" value={business.propuestaValor} onChange={(event) => updateBusiness("propuestaValor", event.target.value)} />
              </Field>
              <Field label="Descripción detallada">
                <textarea className="textarea" value={business.descripcion} onChange={(event) => updateBusiness("descripcion", event.target.value)} />
              </Field>
            </section>

            <section className="panel span-6">
              <h3>Mercado objetivo</h3>
              <Field label="País o región">
                <input className="input" value={target.region} onChange={(event) => updateTarget("region", event.target.value)} />
              </Field>
              <Field label="Tipo de cliente">
                <select className="select" value={target.tipoCliente} onChange={(event) => updateTarget("tipoCliente", event.target.value as TargetData["tipoCliente"])}>
                  <option>B2B</option>
                  <option>B2C</option>
                  <option>Ambos</option>
                </select>
              </Field>
              <Field label="Nivel de madurez">
                <select className="select" value={target.madurez} onChange={(event) => updateTarget("madurez", event.target.value)}>
                  <option>No conoce el problema</option>
                  <option>Conoce el problema</option>
                  <option>Busca soluciones</option>
                  <option>Evalúa proveedores</option>
                  <option>Listo para comprar</option>
                </select>
              </Field>
              <Field label="Profundidad">
                <select className="select" value={target.profundidad} onChange={(event) => updateTarget("profundidad", event.target.value as TargetData["profundidad"])}>
                  <option>Resumen rápido</option>
                  <option>Estándar</option>
                  <option>Completo</option>
                </select>
              </Field>
              <Field label="Número de Buyer Personas">
                <select className="select" value={target.numeroPersonas} onChange={(event) => updateTarget("numeroPersonas", Number(event.target.value) as TargetData["numeroPersonas"])}>
                  <option value={1}>1</option>
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                </select>
              </Field>
            </section>

            <section className="panel span-12">
              <h3>Contexto e investigación</h3>
              <Field label="Texto libre, entrevistas, notas o brief">
                <textarea className="textarea" value={extraContext} onChange={(event) => setExtraContext(event.target.value)} />
              </Field>
              <Field label="Subir archivos de texto">
                <input className="input" type="file" multiple accept=".txt,.md,.csv,.pdf,.docx" onChange={(event) => readFiles(event.target.files)} />
                <span className="hint">TXT, MD y CSV se leen automáticamente. Para PDF o DOCX, pega el texto importante arriba.</span>
              </Field>

              {researchMode === "manual" ? (
                <>
                  <div className="button-row">
                    <button className="btn" onClick={() => setResearchPrompt(buildResearchPrompt(business, target))}>
                      <Clipboard size={17} /> Generar prompt de investigación
                    </button>
                    {researchPrompt ? (
                      <button className="btn ghost" onClick={() => copyText(researchPrompt)}>
                        <Clipboard size={17} /> Copiar
                      </button>
                    ) : null}
                  </div>
                  {researchPrompt ? <pre className="codebox">{researchPrompt}</pre> : null}
                  <Field label="Pega aquí la investigación externa con URLs">
                    <textarea className="textarea" value={researchContext} onChange={(event) => syncManualResearch(event.target.value)} />
                  </Field>
                </>
              ) : null}
            </section>

            <section className="panel span-12">
              {generationMode === "manual" ? (
                <>
                  <h3>Modo Manual · gratis</h3>
                  <div className="button-row">
                    <button className="btn primary" onClick={() => setManualPrompt(buildManualPrompt(userPrompt))}>
                      <Sparkles size={17} /> Generar prompt de Buyer Personas
                    </button>
                    {manualPrompt ? (
                      <button className="btn ghost" onClick={() => copyText(manualPrompt)}>
                        <Clipboard size={17} /> Copiar prompt
                      </button>
                    ) : null}
                  </div>
                  {manualPrompt ? <pre className="codebox">{manualPrompt}</pre> : null}
                  <Field label="Respuesta JSON de la IA externa">
                    <textarea className="textarea" value={pastedJson} onChange={(event) => setPastedJson(event.target.value)} />
                  </Field>
                  <button className="btn primary" onClick={processManualJson}>
                    <Play size={17} /> Procesar respuesta y crear personas
                  </button>
                </>
              ) : (
                <>
                  <h3>Modo API</h3>
                  <p className="hint">La API Key se envía solo a tu despliegue para ejecutar esta petición. No se guarda en disco ni en el navegador.</p>
                  <button className="btn primary" onClick={runApiGeneration} disabled={busy}>
                    <Play size={17} /> Generar Buyer Personas
                  </button>
                </>
              )}
            </section>
          </div>
        ) : null}

        {tab === "resultados" ? (
          result ? (
            <>
              <div className="metric-row">
                <div className="metric"><span>Tokens entrada</span><strong>{usage.inputTokens}</strong></div>
                <div className="metric"><span>Tokens salida</span><strong>{usage.outputTokens}</strong></div>
                <div className="metric"><span>Coste app</span><strong>${usage.cost.toFixed(4)}</strong></div>
                <div className="metric"><span>Búsquedas</span><strong>{searchCount}</strong></div>
              </div>
              <div className="panel">
                <div className="button-row">
                  <button className="btn" onClick={() => copyText(markdown)}><Clipboard size={17} /> Copiar</button>
                  <button className="btn" onClick={() => downloadFile("buyer-personas.md", markdown, "text/markdown")}><Download size={17} /> Markdown</button>
                  <button className="btn" onClick={() => downloadFile("buyer-personas.txt", markdown.replaceAll("#", ""), "text/plain")}><FileText size={17} /> TXT</button>
                  <button className="btn" onClick={() => downloadFile("buyer-personas.json", JSON.stringify(result, null, 2), "application/json")}><FileJson size={17} /> JSON</button>
                  <button className="btn" onClick={() => exportPdf(markdown)}><Download size={17} /> PDF</button>
                </div>
                <div className="markdown-preview">
                  {result.buyer_personas.map((persona, index) => (
                    <article className="persona-card" key={`${persona.nombre}-${index}`}>
                      <h3>{index + 1}. {persona.nombre}</h3>
                      <p>{persona.resumen_ejecutivo}</p>
                      <h4>Objetivos</h4>
                      <ul>{persona.objetivos?.map((item) => <li key={item}>{item}</li>)}</ul>
                      <h4>Motivaciones</h4>
                      <ul>{persona.motivaciones?.map((item) => <li key={item}>{item}</li>)}</ul>
                      <h4>Objeciones</h4>
                      <ul>{persona.objeciones_compra?.map((item) => <li key={item}>{item}</li>)}</ul>
                      <h4>Propuesta de valor</h4>
                      <p>{persona.propuesta_valor}</p>
                      <h4>Confianza</h4>
                      <p>{persona.nivel_confianza}. {persona.justificacion}</p>
                    </article>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="panel empty">Aún no hay resultados. Genera o procesa un JSON desde la pestaña Generar.</div>
          )
        ) : null}

        {tab === "guia" ? (
          <section className="panel markdown-preview">
            <h3>Uso recomendado</h3>
            <ol>
              <li>Elige modo Manual si quieres coste cero y sin claves.</li>
              <li>Rellena los datos del negocio y del mercado objetivo.</li>
              <li>Opcionalmente genera un prompt de investigación y pega resultados con URLs.</li>
              <li>Genera el prompt de Buyer Personas, úsalo en un chat externo y pega aquí el JSON.</li>
              <li>Exporta Markdown, TXT, JSON o PDF.</li>
            </ol>
            <h3>Despliegue</h3>
            <p>Vercel es la opción más directa para esta versión Next.js. Cloudflare Pages puede alojar la parte estática; si quieres conservar las rutas API, conviene usar el adaptador de Next para Cloudflare u optar por Workers específicos.</p>
            <h3>Expectativas</h3>
            <p>Los Buyer Personas son hipótesis estratégicas. La calidad depende de la información aportada y debe validarse con clientes reales.</p>
          </section>
        ) : null}
      </section>
    </main>
  );
}
