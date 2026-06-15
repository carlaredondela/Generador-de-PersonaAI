import json
from typing import Any, Dict

import streamlit as st
import streamlit.components.v1 as components

from exporters import markdown_to_pdf_bytes, personas_to_json, personas_to_markdown, personas_to_txt
from extractors import combine_context, extract_uploaded_file, extract_url_text
from llm import PROVIDERS, build_manual_prompt, build_user_prompt, generate_personas_api, parse_pasted_personas
from research import automatic_research, build_manual_research_prompt, clean_manual_research


st.set_page_config(page_title="PersonaAI Generator", page_icon="🧭", layout="wide")


def copy_button(text: str, label: str, key: str) -> None:
    escaped = json.dumps(text)
    components.html(
        f"""
        <button id="{key}" style="
            background:#111827;color:white;border:0;border-radius:6px;
            padding:0.55rem 0.8rem;cursor:pointer;font-weight:600;">
            {label}
        </button>
        <script>
        const btn = document.getElementById("{key}");
        btn.onclick = async () => {{
            await navigator.clipboard.writeText({escaped});
            btn.innerText = "Copiado";
            setTimeout(() => btn.innerText = "{label}", 1400);
        }};
        </script>
        """,
        height=45,
    )


def init_state() -> None:
    defaults = {
        "result": None,
        "markdown": "",
        "sources": [],
        "usage": {"input_tokens": 0, "output_tokens": 0, "cost": 0.0},
        "search_count": 0,
        "manual_prompt": "",
        "manual_research_prompt": "",
        "research_context": "",
    }
    for key, value in defaults.items():
        st.session_state.setdefault(key, value)


def sidebar_config() -> Dict[str, Any]:
    st.sidebar.header("Configuración")
    generation_mode = st.sidebar.radio(
        "Modo de generación",
        ["Manual · gratis", "API · automático"],
        help="Manual no requiere API Key. API llama directamente a un proveedor de IA.",
    )

    config: Dict[str, Any] = {"generation_mode": generation_mode}
    if generation_mode == "API · automático":
        provider = st.sidebar.selectbox("Proveedor de IA", list(PROVIDERS.keys()))
        model = st.sidebar.selectbox("Modelo", PROVIDERS[provider]["models"])
        api_key = st.sidebar.text_input(
            f"API Key de {provider}",
            type="password",
            help="La clave se usa solo durante esta sesión y no se guarda en disco.",
        )
        temperature = st.sidebar.slider("Temperatura", 0.0, 1.0, 0.3, 0.05)
        max_tokens = st.sidebar.slider("Máximo de tokens", 1000, 12000, 5000, 500)
        config.update(
            {
                "provider": provider,
                "model": model,
                "api_key": api_key,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
        )
    else:
        st.sidebar.info("Modo sin API Key: la app prepara el prompt y procesa el JSON que pegues.")

    st.sidebar.divider()
    st.sidebar.subheader("Investigación de mercado")
    research_mode = st.sidebar.selectbox(
        "Modo de investigación",
        ["Manual asistida", "Automática con API", "Sin investigación"],
        help="La investigación mejora la calidad de las hipótesis y permite citar fuentes.",
    )
    config["research_mode"] = research_mode
    if research_mode == "Automática con API":
        config["search_api_key"] = st.sidebar.text_input(
            "API Key de Tavily",
            type="password",
            help="Se usa para buscar fuentes actuales. Si falla, la app puede continuar sin investigación.",
        )
    return config


def onboarding_tab() -> None:
    st.title("PersonaAI Generator")
    st.write(
        "Crea Buyer Personas accionables para marketing, ventas, producto y estrategia. "
        "Un Buyer Persona es una hipótesis útil sobre quién compra, por qué compra y qué le frena; "
        "por ejemplo, una directora de operaciones que busca ahorrar tiempo pero teme una implantación compleja."
    )

    st.subheader("Modo gratis sin API Key")
    st.info(
        "Elige Modo de generación → Manual. La app prepara el prompt y formatea el resultado; "
        "tú pegas ese prompt en cualquier chat de IA gratuito y devuelves aquí el JSON. "
        "La app pone el pan del sándwich; la IA externa pone el relleno."
    )

    st.subheader("Flujo recomendado")
    st.markdown(
        "1. Configura generación: Manual o API.\n"
        "2. Elige investigación: automática, manual asistida o ninguna.\n"
        "3. Rellena negocio, mercado objetivo y contexto.\n"
        "4. Genera: un clic en API, o copiar prompt y pegar JSON en Manual.\n"
        "5. Revisa resultados y exporta Markdown, TXT, PDF o JSON."
    )

    st.subheader("Modos de investigación")
    st.markdown(
        "- Automática con API: busca fuentes actuales con Tavily.\n"
        "- Manual asistida: genera un prompt de investigación para pegar en otra herramienta y pegar aquí el resumen con URLs.\n"
        "- Sin investigación: más rápido, pero con menor confianza."
    )

    st.subheader("API Keys")
    st.markdown(
        "Una API Key es una contraseña de uso técnico para que la app pueda llamar a un servicio. "
        "Solo hace falta en el modo API o en investigación automática. Puedes obtenerlas en "
        "[OpenAI](https://platform.openai.com/), [Anthropic](https://console.anthropic.com/), "
        "[Google AI Studio](https://aistudio.google.com/), [Mistral](https://console.mistral.ai/), "
        "[Groq](https://console.groq.com/) y [Tavily](https://app.tavily.com/)."
    )

    st.subheader("Consejos")
    st.markdown(
        "- Sé específico: sector, competencia, región, ticket medio, tipo de cliente y propuesta de valor.\n"
        "- Aporta documentos, URLs y notas reales. Basura entra, basura sale.\n"
        "- Trata los Buyer Personas como hipótesis para validar con clientes reales."
    )

    st.subheader("Glosario breve")
    st.markdown(
        "- Nivel de madurez: cuánto sabe el cliente sobre su problema y las soluciones disponibles.\n"
        "- B2B/B2C: venta a empresas o a consumidores finales.\n"
        "- Profundidad del análisis: nivel de detalle del resultado.\n"
        "- Nivel de confianza: qué tan respaldada está cada conclusión por los datos aportados."
    )


def input_forms() -> tuple[Dict[str, Any], Dict[str, Any], str]:
    st.subheader("Datos del negocio")
    col1, col2 = st.columns(2)
    with col1:
        nombre = st.text_input("Nombre del producto o servicio", help="Ejemplo: software de gestión de turnos para clínicas.")
        sector = st.text_input("Sector o mercado", help="Indica el mercado principal y, si aplica, el nicho.")
        competencia = st.text_input("Competencia principal", help="Nombres de competidores o alternativas que usa el cliente.")
    with col2:
        propuesta_valor = st.text_input("Propuesta de valor principal", help="Qué beneficio claro prometes al cliente.")
        descripcion = st.text_area("Descripción detallada", height=150, help="Qué vendes, a quién, precio aproximado y cómo se entrega.")

    st.subheader("Mercado objetivo")
    col3, col4, col5 = st.columns(3)
    with col3:
        region = st.text_input("País o región objetivo", value="España", help="El mercado condiciona canales, lenguaje y objeciones.")
        tipo_cliente = st.selectbox("Tipo de cliente", ["B2B", "B2C", "Ambos"], help="Quién compra o decide.")
    with col4:
        madurez = st.selectbox(
            "Nivel de madurez",
            ["No conoce el problema", "Conoce el problema", "Busca soluciones", "Evalúa proveedores", "Listo para comprar"],
            help="Estado mental del cliente antes de comprar.",
        )
        profundidad = st.selectbox("Profundidad del análisis", ["Resumen rápido", "Estándar", "Completo"])
    with col5:
        numero_personas = st.selectbox("Número de Buyer Personas", [1, 3, 5], index=1)

    st.subheader("Fuentes de información adicionales")
    libre = st.text_area("Texto libre", height=160, help="Pega notas, entrevistas, propuestas, encuestas o información comercial.")
    url = st.text_input("URL del sitio web", help="Opcional. La app intentará extraer texto principal de la página.")
    uploaded_files = st.file_uploader("Sube PDF, TXT o DOCX", type=["pdf", "txt", "docx"], accept_multiple_files=True)

    url_text = ""
    if url:
        try:
            with st.spinner("Extrayendo texto de la URL..."):
                url_text = extract_url_text(url)
            st.success("URL procesada.")
        except Exception as exc:
            st.warning(f"No se pudo leer la URL: {exc}")

    file_texts = []
    for uploaded_file in uploaded_files or []:
        try:
            file_texts.append(extract_uploaded_file(uploaded_file))
        except Exception as exc:
            st.warning(f"No se pudo leer {uploaded_file.name}: {exc}")

    business_data = {
        "nombre": nombre,
        "descripcion": descripcion,
        "sector": sector,
        "competencia": competencia,
        "propuesta_valor": propuesta_valor,
    }
    target_data = {
        "region": region,
        "tipo_cliente": tipo_cliente,
        "madurez": madurez,
        "profundidad": profundidad,
        "numero_personas": numero_personas,
    }
    extra_context = combine_context([libre, url_text, *file_texts])
    return business_data, target_data, extra_context


def research_block(config: Dict[str, Any], business_data: Dict[str, Any], target_data: Dict[str, Any]) -> tuple[str, list[str], int]:
    mode = config["research_mode"]
    if mode == "Sin investigación":
        st.warning("Sin investigación: el nivel de confianza será menor y dependerá más del razonamiento del modelo.")
        return "", [], 0

    if mode == "Manual asistida":
        st.markdown("#### Investigación manual asistida")
        if st.button("Generar prompt de investigación"):
            st.session_state.manual_research_prompt = build_manual_research_prompt(business_data, target_data)
        if st.session_state.manual_research_prompt:
            copy_button(st.session_state.manual_research_prompt, "Copiar prompt de investigación", "copy_research")
            st.code(st.session_state.manual_research_prompt, language="markdown")
        pasted = st.text_area("Pega aquí la investigación externa con fuentes/URLs", height=180)
        context, sources = clean_manual_research(pasted)
        st.session_state.research_context = context
        return context, sources, 0

    st.markdown("#### Investigación automática")
    if not config.get("search_api_key"):
        st.warning("Falta la API Key de búsqueda. Puedes continuar sin investigación o usar la investigación manual asistida.")
        return "", [], 0
    try:
        with st.spinner("Buscando información de mercado..."):
            result = automatic_research(config["search_api_key"], business_data, target_data)
        st.success(f"Investigación completada con {result['search_count']} búsquedas.")
        with st.expander("Ver fuentes encontradas"):
            for url in result["sources"]:
                st.write(url)
        return result["context"], result["sources"], result["search_count"]
    except Exception as exc:
        st.warning(f"La búsqueda falló y la app continuará sin investigación: {exc}")
        return "", [], 0


def store_result(result: Dict[str, Any], sources: list[str], search_count: int) -> None:
    st.session_state.result = result["data"]
    st.session_state.sources = sources
    st.session_state.usage = result["usage"]
    st.session_state.search_count = search_count
    st.session_state.markdown = personas_to_markdown(result["data"], sources)


def generation_tab(config: Dict[str, Any]) -> None:
    st.title("Generar Buyer Personas")
    business_data, target_data, extra_context = input_forms()
    research_context, sources, search_count = research_block(config, business_data, target_data)
    user_prompt = build_user_prompt(business_data, target_data, extra_context, research_context, sources)

    if config["generation_mode"] == "API · automático":
        if st.button("Generar Buyer Personas", type="primary"):
            try:
                with st.spinner("Generando Buyer Personas..."):
                    result = generate_personas_api(
                        config["provider"],
                        config["model"],
                        config["api_key"],
                        user_prompt,
                        config["temperature"],
                        config["max_tokens"],
                    )
                store_result(result, sources, search_count)
                st.success("Buyer Personas generados.")
            except Exception as exc:
                st.error(f"No se pudo generar el resultado: {exc}")
        return

    st.markdown("### Modo Manual · gratis")
    st.markdown("Paso 1: genera el prompt, cópialo y pégalo en ChatGPT, Claude, Gemini, Copilot u otro chat de IA.")
    if st.button("Generar prompt de Buyer Personas", type="primary"):
        st.session_state.manual_prompt = build_manual_prompt(user_prompt)
    if st.session_state.manual_prompt:
        copy_button(st.session_state.manual_prompt, "Copiar prompt de Buyer Personas", "copy_personas")
        st.code(st.session_state.manual_prompt, language="markdown")

    st.markdown("Paso 2: pega en esa IA el prompt anterior y pide que responda solo con JSON.")
    st.markdown("Paso 3: pega aquí el JSON recibido.")
    pasted_json = st.text_area("Respuesta JSON de la IA externa", height=260)
    if st.button("Procesar respuesta y crear personas"):
        try:
            result = parse_pasted_personas(pasted_json)
            store_result(result, sources, search_count)
            st.success("JSON procesado. El resultado está listo en la pestaña Resultados.")
        except Exception as exc:
            st.error(str(exc))


def results_tab() -> None:
    st.title("Resultados")
    if not st.session_state.result:
        st.info("Aún no hay resultados. Genera o procesa Buyer Personas en la pestaña Generar.")
        return

    usage = st.session_state.usage
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Tokens entrada", usage.get("input_tokens", 0))
    col2.metric("Tokens salida", usage.get("output_tokens", 0))
    col3.metric("Coste estimado", f"${usage.get('cost', 0.0):.6f}")
    col4.metric("Búsquedas web", st.session_state.search_count)
    if usage.get("cost", 0.0) == 0:
        st.caption("En modo Manual, los tokens y el coste contabilizados por esta app son 0.")

    markdown_text = st.session_state.markdown
    copy_button(markdown_text, "Copiar resultado", "copy_result")
    st.markdown(markdown_text)

    json_text = personas_to_json(st.session_state.result)
    txt_text = personas_to_txt(st.session_state.result, st.session_state.sources)
    pdf_bytes = markdown_to_pdf_bytes(markdown_text)

    st.download_button("Descargar Markdown", markdown_text, "buyer-personas.md", "text/markdown")
    st.download_button("Descargar TXT", txt_text, "buyer-personas.txt", "text/plain")
    st.download_button("Descargar JSON original", json_text, "buyer-personas.json", "application/json")
    st.download_button("Descargar PDF", pdf_bytes, "buyer-personas.pdf", "application/pdf")


def main() -> None:
    init_state()
    config = sidebar_config()
    tabs = st.tabs(["Cómo funciona", "Generar", "Resultados"])
    with tabs[0]:
        onboarding_tab()
    with tabs[1]:
        generation_tab(config)
    with tabs[2]:
        results_tab()


if __name__ == "__main__":
    main()
