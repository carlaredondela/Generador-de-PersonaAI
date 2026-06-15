# PersonaAI Generator

Aplicación Streamlit para crear Buyer Personas avanzados. Funciona con API de IA mediante LiteLLM o de forma gratuita sin API Key usando el flujo manual de copiar prompt y pegar JSON.

## Instalación

1. Abre una terminal en esta carpeta.
2. Crea un entorno virtual, si quieres aislar dependencias:

```bash
python -m venv .venv
```

3. Actívalo:

```bash
.venv\Scripts\activate
```

4. Instala dependencias:

```bash
python -m pip install -r requirements.txt
```

## Ejecución local

Comando recomendado:

```bash
python -m streamlit run app.py
```

También puede funcionar:

```bash
streamlit run app.py
```

Si `streamlit` no está en el PATH de Windows, usa el primer comando.

## Uso rápido sin API Key

1. En la barra lateral, elige `Modo de generación` → `Manual · gratis`.
2. En `Investigación de mercado`, elige `Manual asistida` o `Sin investigación`.
3. Rellena los datos del negocio y el mercado objetivo.
4. Pulsa `Generar prompt de Buyer Personas`.
5. Copia el prompt y pégalo en ChatGPT, Claude, Gemini, Copilot u otro chat.
6. Copia la respuesta JSON de esa IA.
7. Pégala en `Respuesta JSON de la IA externa`.
8. Pulsa `Procesar respuesta y crear personas`.
9. Ve a `Resultados` y exporta Markdown, TXT, PDF o JSON.

## Uso con API

1. En la barra lateral, elige `API · automático`.
2. Selecciona proveedor, modelo, temperatura y tokens.
3. Pega la API Key del proveedor. La app no la guarda en disco.
4. Si quieres investigación automática, elige `Automática con API` y pega tu API Key de Tavily.
5. Rellena el formulario y pulsa `Generar Buyer Personas`.

## Estructura del proyecto

- `app.py`: interfaz, flujo de usuario y orquestación.
- `llm.py`: proveedores, prompt del sistema, generación API, modo manual, parser y validador JSON.
- `research.py`: investigación automática con Tavily y modo manual asistido.
- `extractors.py`: extracción de texto de URL, PDF, TXT y DOCX.
- `exporters.py`: conversión a Markdown, TXT, JSON y PDF.
- `requirements.txt`: dependencias.

## Notas

- Los modelos están concentrados en `PROVIDERS` dentro de `llm.py` para poder actualizarlos en un solo lugar.
- El modo manual contabiliza coste y tokens como 0 porque la inferencia ocurre fuera de la app.
- Los Buyer Personas deben tratarse como hipótesis de trabajo y validarse con clientes reales.
