# PersonaAI Generator

Aplicación Next.js para crear Buyer Personas avanzados con una interfaz limpia y sin marca de Streamlit.

## Qué incluye

- Modo Manual gratis: genera un prompt, lo pegas en una IA externa y vuelves con el JSON.
- Parser tolerante: limpia vallas ```json, texto antes/después y comas colgantes.
- Validación del esquema obligatorio de Buyer Personas.
- Investigación manual asistida y automática con Tavily.
- Modo API opcional para OpenAI, Anthropic, Google, Mistral y Groq.
- Exportación a Markdown, TXT, JSON y PDF.

## Desarrollo local

```bash
npm install
npm run dev
```

Abre:

```text
http://localhost:3000
```

## Build

```bash
npm run build
npm run start
```

## Despliegue recomendado: Vercel

1. Conecta este repositorio en Vercel.
2. Framework preset: `Next.js`.
3. Build command: `npm run build`.
4. Output: automático.
5. No necesitas variables de entorno para el modo Manual gratis.

Las API Keys se introducen en pantalla y se usan solo para esa petición. No se guardan en el repositorio.

## Cloudflare

Cloudflare Pages es excelente para sitios estáticos y frontends. Esta app usa rutas de servidor (`/api/generate` y `/api/research`) para el modo API y Tavily, por lo que la opción más directa es Vercel.

Si quieres usar Cloudflare:

- Para usar solo modo Manual: puede adaptarse a exportación estática.
- Para conservar API y Tavily: conviene añadir un adaptador compatible con Next.js en Cloudflare o mover esas rutas a Cloudflare Workers.

## Archivos principales

- `app/page.tsx`: interfaz principal.
- `app/api/generate/route.ts`: generación automática opcional.
- `app/api/research/route.ts`: investigación automática opcional.
- `lib/persona.ts`: prompts, parser, validación y exportación Markdown.
- `lib/providers.ts`: llamadas a proveedores de IA.
