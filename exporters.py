import io
import json
from html import escape
from typing import Any, Dict, Iterable

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


def _as_list(value: Any) -> Iterable[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    if isinstance(value, dict):
        return [f"{key}: {val}" for key, val in value.items()]
    if value in (None, ""):
        return []
    return [str(value)]


def _section(title: str, value: Any) -> str:
    items = list(_as_list(value))
    if not items:
        return f"### {title}\n\nNo especificado.\n"
    if len(items) == 1 and not isinstance(value, list):
        return f"### {title}\n\n{items[0]}\n"
    return f"### {title}\n\n" + "\n".join(f"- {item}" for item in items) + "\n"


def personas_to_markdown(data: Dict[str, Any], sources: list[str] | None = None) -> str:
    personas = data.get("buyer_personas", [])
    chunks = ["# Buyer Personas\n"]
    for index, persona in enumerate(personas, start=1):
        chunks.append(f"## {index}. {persona.get('nombre', 'Buyer Persona')}\n")
        chunks.append(_section("Resumen ejecutivo", persona.get("resumen_ejecutivo")))
        chunks.append(_section("Perfil demográfico", persona.get("perfil_demografico")))
        chunks.append(_section("Perfil profesional", persona.get("perfil_profesional")))
        chunks.append(_section("Objetivos", persona.get("objetivos")))
        chunks.append(_section("Motivaciones", persona.get("motivaciones")))
        chunks.append(_section("Frustraciones", persona.get("frustraciones")))
        chunks.append(_section("Objeciones de compra", persona.get("objeciones_compra")))
        chunks.append(_section("Comportamiento digital", persona.get("comportamiento_digital")))
        chunks.append(_section("Proceso de decisión", persona.get("proceso_decision")))
        chunks.append(_section("Mensajes más efectivos", persona.get("mensajes_clave")))
        chunks.append(_section("Propuesta de valor recomendada", persona.get("propuesta_valor")))
        chunks.append(_section("Ideas de marketing", persona.get("ideas_marketing")))
        chunks.append(_section("Nivel de confianza", persona.get("nivel_confianza")))
        chunks.append(_section("Justificación", persona.get("justificacion")))
    if sources:
        chunks.append("## Fuentes\n")
        chunks.extend(f"- {url}\n" for url in sources)
    return "\n".join(chunks)


def personas_to_txt(data: Dict[str, Any], sources: list[str] | None = None) -> str:
    return personas_to_markdown(data, sources).replace("#", "").replace("*", "")


def personas_to_json(data: Dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2)


def markdown_to_pdf_bytes(markdown_text: str) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=42, leftMargin=42, topMargin=42, bottomMargin=42)
    styles = getSampleStyleSheet()
    story = []
    for raw_line in markdown_text.splitlines():
        line = raw_line.strip()
        if not line:
            story.append(Spacer(1, 8))
            continue
        if line.startswith("# "):
            story.append(Paragraph(escape(line[2:]), styles["Title"]))
        elif line.startswith("## "):
            story.append(Paragraph(escape(line[3:]), styles["Heading2"]))
        elif line.startswith("### "):
            story.append(Paragraph(escape(line[4:]), styles["Heading3"]))
        elif line.startswith("- "):
            story.append(Paragraph(f"• {escape(line[2:])}", styles["BodyText"]))
        else:
            story.append(Paragraph(escape(line), styles["BodyText"]))
    doc.build(story)
    return buffer.getvalue()
