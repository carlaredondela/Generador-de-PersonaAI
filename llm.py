import json
import os
import re
from contextlib import contextmanager
from typing import Any, Dict, List, Tuple

from litellm import completion

try:
    from litellm import completion_cost
except Exception:  # pragma: no cover - LiteLLM keeps this utility optional across versions.
    completion_cost = None


SYSTEM_PROMPT = """Eres un Director de Marketing Estratégico, Growth Marketing, Investigación de Mercados y Psicología del Consumidor con más de 20 años de experiencia.

Tu misión es construir Buyer Personas extremadamente útiles y accionables. Evita perfiles genéricos. Evita estereotipos. No inventes datos específicos sin indicarlo.

Prioriza siempre comportamiento, motivaciones, objeciones y contexto de compra frente a simples datos demográficos. Todas las conclusiones deben estar justificadas por la información disponible. Cuando la información sea insuficiente, indícalo explícitamente. Razona de forma estratégica como si asesoraras a una empresa real.

Cada Buyer Persona debe ser útil para: Marketing, Publicidad, Ventas, Contenido, SEO, Posicionamiento y Diseño de producto.

Antes de generar el resultado final: analiza toda la información recibida, identifica patrones relevantes, evalúa el nivel de confianza de cada conclusión y genera un perfil coherente y accionable.

Devuelve EXCLUSIVAMENTE un objeto JSON válido que cumpla el esquema indicado. No incluyas texto fuera del JSON, ni Markdown, ni explicaciones adicionales."""


PROVIDERS = {
    "OpenAI": {
        "models": ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini"],
        "env_key": "OPENAI_API_KEY",
        "supports_json_mode": True,
        "litellm_prefix": "",
    },
    "Anthropic": {
        "models": ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"],
        "env_key": "ANTHROPIC_API_KEY",
        "supports_json_mode": False,
        "litellm_prefix": "anthropic/",
    },
    "Google": {
        "models": ["gemini-2.5-pro", "gemini-2.5-flash"],
        "env_key": "GEMINI_API_KEY",
        "supports_json_mode": True,
        "litellm_prefix": "gemini/",
    },
    "Mistral": {
        "models": ["mistral-large-latest", "mistral-small-latest"],
        "env_key": "MISTRAL_API_KEY",
        "supports_json_mode": True,
        "litellm_prefix": "mistral/",
    },
    "Groq": {
        "models": ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"],
        "env_key": "GROQ_API_KEY",
        "supports_json_mode": True,
        "litellm_prefix": "groq/",
    },
}


JSON_SCHEMA_EXAMPLE = {
    "buyer_personas": [
        {
            "nombre": "",
            "resumen_ejecutivo": "",
            "perfil_demografico": {
                "edad_estimada": "",
                "educacion": "",
                "ingresos": "",
                "localizacion": "",
            },
            "perfil_profesional": {
                "cargo": "",
                "responsabilidades": "",
                "poder_decision": "",
            },
            "objetivos": [],
            "motivaciones": [],
            "frustraciones": [],
            "objeciones_compra": [],
            "comportamiento_digital": {
                "redes": [],
                "canales": [],
                "formatos": [],
                "dispositivos": [],
            },
            "proceso_decision": "",
            "mensajes_clave": [],
            "propuesta_valor": "",
            "ideas_marketing": {
                "contenidos": [],
                "anuncios": [],
                "seo_keywords": [],
                "ctas": [],
            },
            "nivel_confianza": "",
            "justificacion": "",
        }
    ]
}


REQUIRED_PERSONA_KEYS = [
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
]

REQUIRED_IDEAS_KEYS = ["contenidos", "anuncios", "seo_keywords", "ctas"]


def full_model_id(provider: str, model: str) -> str:
    prefix = PROVIDERS[provider]["litellm_prefix"]
    if not prefix or model.startswith(prefix):
        return model
    return f"{prefix}{model}"


def build_user_prompt(
    business_data: Dict[str, Any],
    target_data: Dict[str, Any],
    extra_context: str = "",
    research_context: str = "",
    sources: List[str] | None = None,
) -> str:
    sources = sources or []
    payload = {
        "datos_del_negocio": business_data,
        "mercado_objetivo": target_data,
        "contexto_adicional": extra_context.strip() or "No aportado.",
        "investigacion_de_mercado": research_context.strip() or "No aportada.",
        "fuentes_detectadas": sources,
    }
    return f"""Genera Buyer Personas accionables para el siguiente caso.

Datos disponibles:
{json.dumps(payload, ensure_ascii=False, indent=2)}

Instrucciones específicas:
- Genera exactamente {target_data.get("numero_personas", 3)} Buyer Persona(s).
- Ajusta la profundidad al nivel indicado: {target_data.get("profundidad", "Estándar")}.
- Distingue en la justificación qué proviene de investigación web/pegada y qué es inferencia estratégica.
- Si no hay datos suficientes para una conclusión, dilo explícitamente.
- Para cada persona, entrega 5 ideas de contenido, 5 anuncios, 5 keywords SEO y 5 CTAs cuando sea razonable.
- Usa "Alto", "Medio" o "Bajo" en nivel_confianza.

Esquema JSON obligatorio:
{json.dumps(JSON_SCHEMA_EXAMPLE, ensure_ascii=False, indent=2)}

Responde solo con un objeto JSON válido. No uses Markdown. No incluyas texto antes ni después del JSON."""


def build_manual_prompt(user_prompt: str) -> str:
    return f"""{SYSTEM_PROMPT}

Ahora actúa sobre esta solicitud completa:

{user_prompt}

Recordatorio final obligatorio:
Devuelve exclusivamente un objeto JSON válido que respete todas las claves del esquema. No incluyas explicaciones, saludos, comentarios, Markdown ni vallas de código."""


def _strip_code_fences(text: str) -> str:
    cleaned = text.strip()
    cleaned = re.sub(r"^\s*```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```\s*$", "", cleaned)
    return cleaned.strip()


def _remove_trailing_commas(text: str) -> str:
    return re.sub(r",\s*([}\]])", r"\1", text)


def _extract_json(text: str) -> Dict[str, Any]:
    if not text or not text.strip():
        raise ValueError("La respuesta pegada está vacía.")

    cleaned = _strip_code_fences(text)
    first = cleaned.find("{")
    last = cleaned.rfind("}")
    if first == -1 or last == -1 or last <= first:
        raise ValueError("No se detecta un objeto JSON. Pide a la IA externa: 'devuélvemelo solo en JSON válido'.")

    candidate = cleaned[first : last + 1]
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        try:
            return json.loads(_remove_trailing_commas(candidate))
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"El JSON no se puede leer: {exc.msg} en la línea {exc.lineno}, columna {exc.colno}. "
                "Pide a la IA externa que lo devuelva solo en JSON, sin texto ni vallas de código."
            ) from exc


def validate_personas(data: Dict[str, Any]) -> None:
    if not isinstance(data, dict):
        raise ValueError("La respuesta debe ser un objeto JSON.")
    personas = data.get("buyer_personas")
    if not isinstance(personas, list) or not personas:
        raise ValueError("Falta la clave obligatoria 'buyer_personas' como lista con al menos un elemento.")

    errors = []
    for index, persona in enumerate(personas, start=1):
        if not isinstance(persona, dict):
            errors.append(f"la persona #{index} no es un objeto")
            continue
        missing = [key for key in REQUIRED_PERSONA_KEYS if key not in persona]
        if missing:
            errors.append(f"a la persona #{index} le faltan las claves: {', '.join(missing)}")

        ideas = persona.get("ideas_marketing")
        if not isinstance(ideas, dict):
            errors.append(f"a la persona #{index} le falta 'ideas_marketing' como objeto")
        else:
            missing_ideas = [key for key in REQUIRED_IDEAS_KEYS if key not in ideas]
            if missing_ideas:
                errors.append(f"a la persona #{index} le faltan ideas_marketing: {', '.join(missing_ideas)}")

    if errors:
        raise ValueError(
            "El JSON no respeta el esquema: "
            + "; ".join(errors)
            + ". Pide a la IA externa: 'devuélvemelo solo en JSON, respetando todas las claves'."
        )


def parse_pasted_personas(text: str) -> Dict[str, Any]:
    data = _extract_json(text)
    validate_personas(data)
    return {
        "data": data,
        "usage": {"input_tokens": 0, "output_tokens": 0, "cost": 0.0},
        "raw": json.dumps(data, ensure_ascii=False, indent=2),
    }


@contextmanager
def _temporary_api_key(env_key: str, api_key: str):
    previous = os.environ.get(env_key)
    if api_key:
        os.environ[env_key] = api_key
    try:
        yield
    finally:
        if previous is None:
            os.environ.pop(env_key, None)
        else:
            os.environ[env_key] = previous


def _response_text(response: Any) -> str:
    try:
        return response.choices[0].message.content or ""
    except Exception:
        return response["choices"][0]["message"]["content"] or ""


def _usage(response: Any) -> Dict[str, Any]:
    usage_obj = getattr(response, "usage", None)
    if usage_obj is None and isinstance(response, dict):
        usage_obj = response.get("usage", {})

    def read(name: str, default: int = 0) -> int:
        if isinstance(usage_obj, dict):
            return int(usage_obj.get(name, default) or default)
        return int(getattr(usage_obj, name, default) or default)

    cost = 0.0
    if completion_cost:
        try:
            cost = float(completion_cost(completion_response=response) or 0.0)
        except Exception:
            cost = 0.0

    return {
        "input_tokens": read("prompt_tokens"),
        "output_tokens": read("completion_tokens"),
        "cost": cost,
    }


def generate_personas_api(
    provider: str,
    model: str,
    api_key: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
) -> Dict[str, Any]:
    if not api_key:
        raise ValueError("Falta la API Key del proveedor de IA.")

    provider_config = PROVIDERS[provider]
    request = {
        "model": full_model_id(provider, model),
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if provider_config["supports_json_mode"]:
        request["response_format"] = {"type": "json_object"}

    with _temporary_api_key(provider_config["env_key"], api_key):
        response = completion(**request)

    raw = _response_text(response)
    try:
        data = _extract_json(raw)
        validate_personas(data)
    except ValueError as first_error:
        repair_prompt = (
            "Tu respuesta anterior no era JSON válido o no respetaba el esquema. "
            f"Error detectado: {first_error}. Corrige la respuesta y devuelve únicamente JSON válido.\n\n"
            f"Respuesta anterior:\n{raw}"
        )
        repair_request = dict(request)
        repair_request["messages"] = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
            {"role": "assistant", "content": raw},
            {"role": "user", "content": repair_prompt},
        ]
        with _temporary_api_key(provider_config["env_key"], api_key):
            response = completion(**repair_request)
        raw = _response_text(response)
        data = _extract_json(raw)
        validate_personas(data)

    return {"data": data, "usage": _usage(response), "raw": raw}
