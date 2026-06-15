import re
from typing import Any, Dict, List, Tuple

import streamlit as st


URL_RE = re.compile(r"https?://[^\s\]\)>,\"']+")


def build_research_queries(business_data: Dict[str, Any], target_data: Dict[str, Any]) -> List[str]:
    product = business_data.get("nombre", "")
    sector = business_data.get("sector", "")
    region = target_data.get("region", "")
    customer_type = target_data.get("tipo_cliente", "")
    competitors = business_data.get("competencia", "")

    base = f"{product} {sector} {region} {customer_type}".strip()
    return [
        f"{base} tendencias mercado clientes 2026",
        f"{base} comportamiento de compra objeciones canales",
        f"{base} competidores posicionamiento precios {competitors}",
        f"{base} marketing ventas SEO mensajes efectivos",
    ]


def build_manual_research_prompt(business_data: Dict[str, Any], target_data: Dict[str, Any]) -> str:
    queries = build_research_queries(business_data, target_data)
    return f"""Investiga el mercado para crear Buyer Personas accionables.

Datos del negocio:
- Producto/servicio: {business_data.get("nombre", "")}
- Descripción: {business_data.get("descripcion", "")}
- Sector: {business_data.get("sector", "")}
- Competencia: {business_data.get("competencia", "")}
- Propuesta de valor: {business_data.get("propuesta_valor", "")}

Mercado objetivo:
- Región: {target_data.get("region", "")}
- Tipo de cliente: {target_data.get("tipo_cliente", "")}
- Nivel de madurez: {target_data.get("madurez", "")}

Busca y resume:
1. Tendencias del sector y del mercado.
2. Competidores y posicionamiento.
3. Comportamiento del cliente, canales y formatos de contenido.
4. Objeciones habituales, criterios de compra y sensibilidad a precio.
5. Oportunidades de mensajes, SEO y anuncios.

Consultas sugeridas:
{chr(10).join(f"- {query}" for query in queries)}

Devuelve un resumen claro con fuentes y URLs. No inventes datos específicos sin fuente."""


def clean_manual_research(text: str, max_chars: int = 14000) -> Tuple[str, List[str]]:
    text = (text or "").strip()
    urls = sorted(set(URL_RE.findall(text)))
    compact = re.sub(r"\n{3,}", "\n\n", text)
    return compact[:max_chars], urls


@st.cache_data(show_spinner=False, ttl=3600)
def cached_tavily_search(_api_key: str, queries: Tuple[str, ...], max_results: int = 3) -> Dict[str, Any]:
    from tavily import TavilyClient

    client = TavilyClient(api_key=_api_key)
    output = {"blocks": [], "sources": [], "search_count": 0}
    for query in queries:
        result = client.search(
            query=query,
            search_depth="advanced",
            max_results=max_results,
            include_answer=True,
        )
        output["search_count"] += 1
        answer = result.get("answer")
        if answer:
            output["blocks"].append(f"Consulta: {query}\nResumen: {answer}")
        for item in result.get("results", []):
            url = item.get("url", "")
            title = item.get("title", "")
            content = item.get("content", "")
            if url:
                output["sources"].append(url)
            output["blocks"].append(f"Fuente: {title}\nURL: {url}\nExtracto: {content}")
    output["sources"] = sorted(set(output["sources"]))
    return output


def automatic_research(api_key: str, business_data: Dict[str, Any], target_data: Dict[str, Any]) -> Dict[str, Any]:
    queries = tuple(build_research_queries(business_data, target_data))
    result = cached_tavily_search(api_key, queries)
    context = "\n\n".join(result["blocks"])
    return {
        "context": context[:16000],
        "sources": result["sources"],
        "search_count": result["search_count"],
        "queries": list(queries),
    }
