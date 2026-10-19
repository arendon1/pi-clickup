# PLAN.md — `pi-clickup`: Native pi Tool Extension for the ClickUp API

> Generado por `@planner` (glm). Auditoría del surface API pendiente de `@researcher` (glm, en curso). Las marcas `[PENDIENTE-RESEARCHER]` se cierran cuando el agente de investigación completa su informe.

## 1. Visión y scope

- **Qué hace:** una extensión de pi (tool nativo, instalable vía `pi install git:github.com/<owner>/pi-clickup`) que expone la surface completa de la API de ClickUp v2 + v3 como herramientas model-callables registradas con `pi.registerTool()`, más un comando `/clickup` con 3 subcomandos (`config`, `auth`, `status`) para configurar PAT, workspace default y probar credenciales.
- **Qué NO hace:** no duplica ni reemplaza el skill `use-clickup` en v1 (el skill sigue siendo la capa de conocimiento/instrucciones; el tool es la capa ejecutable). No orquesta workflows de proyecto (auto-commit, sincronización Moodle, etc.). No implementa caching persistente en disco (solo rate-limit en memoria por proceso). No incluye OAuth (solo PAT — ClickUp OAuth es otra superficie; queda fuera v1).
- **Decisiones de scope tomadas:**
  - **D1 — Estrategia de tools:** dominios agrupados (13 tools tipo `clickup_tasks`, `clickup_lists`, … cada uno con un `action` enum interno) en lugar de 1 mega-tool o ~60 tools granulares. Justificación completa en §3.
  - **D2 — Cobertura v1:** todos los dominios presentes en las references del skill existente (13 dominios), incluyendo v3 (docs/chat) porque ya está verificado que funcionan. Cualquier endpoint fuera de esas references se marca `[PENDIENTE-RESEARCHER]`.
  - **D3 — Config externa al agente dir:** config en `~/.config/clickup-pi/config.json` (XDG), no dentro de `~/.pi/agent/`, para no ensuciar el directorio gestionado por pi y facilitar backup/rotación del PAT. Env vars `CLICKUP_API_KEY` / `CLICKUP_TEAM` soportadas como override (compatibilidad con el orden de resolución actual del skill).
  - **D4 — Zero runtime dependencies:** todo lo necesario es host-provided (pi-ai, pi-tui, typebox, `fetch` nativo de Node). No se agregan libs de HTTP ni de TUI.
  - **D5 — Custom Fields se incluyen aunque Free los bloquee:** el tool existe, y un 403 con scope/tier insuficiente produce un error claro y accionable (ver §5), en lugar de ocultar el tool.
- **Naming final:**
  - **Package/repo:** `pi-clickup` (convención `pi-<nombre>` de la comunidad de paquetes pi; ejemplos oficiales usan `pi-tools`, `pi-package`). Repo GitHub sugerido: `github.com/<owner>/pi-clickup` — el owner es decisión de Andrés (§8). El directorio local actual `clickup-pi-tool/` se renombra a `pi-clickup/` en el paso 1 de implementación (o se deja y solo el repo se llama distinto — decisión menor, ver §8).
  - **Tool names:** plural de dominio, prefix `clickup_`: `clickup_tasks`, `clickup_lists`, … (14 en total incl. `clickup_config`). Plural porque cada tool opera sobre la colección Y sobre items individuales vía `action` (`get` vs `list`).

## 2. Arquitectura de la extensión

```
┌──────────────────────────────────────────────────────────────────────┐
│  pi process (TUI / RPC / print modes)                                │
│                                                                      │
│   LLM ── pi.registerTool() ── 14 tools: clickup_{tasks,lists,...}    │
│   User ── /clickup config|auth|status ── pi.registerCommand()        │
└──────────────┬───────────────────────────────────────┬───────────────┘
               │ execute(id, params, signal, onUpdate)  │ ctx.ui.select/confirm/input
     ┌─────────▼──────────┐                    ┌────────▼─────────┐
     │  src/tools/*.ts    │                    │  src/tui.ts      │
     │  13 domain tools   │                    │  auth/config/    │
     │  (action enum +    │                    │  status dialogs  │
     │   TypeBox schema)  │                    └────────┬─────────┘
     └─────────┬──────────┘                             │
               │              read/write                │
     ┌─────────▼────────────────────────────────────────▼─────────┐
     │  src/config.ts ── ~/.config/clickup-pi/config.json         │
     │  (PAT, team_id, base URLs, timeout, retries, rate margin)  │
     └─────────┬───────────────────────────────────────────────────┘
               │
     ┌─────────▼───────────────────────────────────────────────────┐
     │  src/api.ts ── single fetch client                          │
     │   - header: Authorization: <raw PAT>  (NO Bearer — quirk)   │
     │   - base: /api/v2 | /api/v3                                 │
     │   - timeout, retries, redaction                             │
     │  src/rate-limit.ts ── sliding window 100/min + queue        │
     │  src/errors.ts ── 401/403/404/429/5xx taxonomy              │
     └─────────┬───────────────────────────────────────────────────┘
               │ HTTPS
     ┌─────────▼───────────────────────┐
     │  api.clickup.com  v2 + v3       │
     └─────────────────────────────────┘
```

### Lista de archivos a crear

| Archivo | Descripción (1 línea) |
|---|---|
| `package.json` | Manifest pi: `pi.extensions: ["./index.ts"]`, keywords `["pi-package"]`, peerDeps host-provided. |
| `tsconfig.json` | TypeScript estricto, `module: "NodeNext"`, imports relativos (pi carga .ts vía jiti — nada de path aliases). |
| `index.ts` | Entry point: default export de la factory; registra comandos y delega a `src/tools/registry`. |
| `src/config.ts` | Schema TS + load/save/validación de `~/.config/clickup-pi/config.json` (chmod 600). |
| `src/api.ts` | Cliente HTTP único: auth header raw, base URLs v2/v3, timeout por request, reintentos, redacción de PAT. |
| `src/rate-limit.ts` | Ventana deslizante en memoria (100/min por token) + cola serializada + manejo de `Retry-After`. |
| `src/errors.ts` | Taxonomía de errores de ClickUp → mensajes accionables para el LLM; redacción de Authorization en logs. |
| `src/validate.ts` | Ping a `/v2/user` y `/v2/team`: valida PAT, detecta scopes, lista workspaces para la TUI. |
| `src/tui.ts` | Diálogos `/clickup` usando `ctx.ui.select/confirm/input` (nada de componentes custom en v1). |
| `src/tools/registry.ts` | Agrega los 14 tool definitions y los registra con `pi.registerTool()`. |
| `src/tools/shared.ts` | Helpers compartidos: esquemas comunes (team_id, paginación, dates), shaping de results. |
| `src/tools/tasks.ts` | `clickup_tasks`: get/list/create/update/delete/search/move/duplicate/tags/status. |
| `src/tools/lists.ts` | `clickup_lists`: CRUD de listas (foldered + folderless) + override de statuses (quirk). |
| `src/tools/folders.ts` | `clickup_folders`: CRUD de folders dentro de spaces. |
| `src/tools/spaces.ts` | `clickup_spaces`: discovery de spaces + features de space. |
| `src/tools/comments.ts` | `clickup_comments`: comentarios de task y de list. |
| `src/tools/checklists.ts` | `clickup_checklists`: checklists e items sobre tasks. |
| `src/tools/tags.ts` | `clickup_tags`: tags de space y add/remove en tasks (endpoint dedicado — quirk). |
| `src/tools/custom-fields.ts` | `clickup_custom_fields`: definiciones y valores (403 esperado en Free). |
| `src/tools/goals.ts` | `clickup_goals`: CRUD de goals y sus metas/KR. |
| `src/tools/webhooks.ts` | `clickup_webhooks`: CRUD de webhooks (quirk allowlist de URL pública). |
| `src/tools/docs.ts` | `clickup_docs`: docs y pages (API v3). |
| `src/tools/chat.ts` | `clickup_chat`: canales, mensajes y reacciones (API v3). |
| `src/tools/users.ts` | `clickup_users`: usuario autenticado + miembros del workspace. |
| `src/tools/config-tool.ts` | `clickup_config`: acción no-crud para whoami/status/rate-limit desde el LLM. |
| `README.md` | Qué hace, instalación con `pi install`, configuración con `/clickup`, tabla de tools. |
| `LICENSE` | MIT (sugerido — ver §6). |
| `.gitignore` | `node_modules/`, `.env`, `*.log`, `dist/`, `.DS_Store`. |

Total: ~27 archivos. Ningún subdirectorio adicional (no `tests/` separado — smoke test como script dentro de `scripts/smoke.ts` opcional, decidido en paso 13).

### Estructura de `package.json`

```jsonc
{
  "name": "pi-clickup",
  "version": "0.1.0",
  "description": "Full-surface ClickUp API as native pi tools (v2 + v3)",
  "type": "module",
  "keywords": ["pi-package", "clickup"],
  "license": "MIT",
  "scripts": {
    "check": "tsc --noEmit",
    "smoke": "node --experimental-strip-types scripts/smoke.ts"
  },
  "peerDependencies": {
    "@earendil-works/pi-ai": "*",
    "@earendil-works/pi-agent-core": "*",
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*",
    "typebox": "*"
  },
  "pi": {
    "extensions": ["./index.ts"]
  }
}
```

Reglas del contract confirmadas en docs/packages.md:
- Los 5 host-provided packages van **solo** en `peerDependencies` con rango `"*"`; listarlos en `dependencies` dispara un warning de pi y puede romper el module mapping.
- `dependencies` queda vacío (D4: zero runtime deps). `fetch` es global en Node ≥18; `undici` es dependencia de pi, no del package.
- `pi.extensions` apunta a `./index.ts` (root del repo, igual que el ejemplo `with-deps`).

### Manifest / entry point

`index.ts` exporta **una sola cosa**: la default factory que recibe `ExtensionAPI`. Patrón confirmado en `examples/extensions/hello.ts` y `todo.ts`:

```ts
// pseudocódigo de la forma (NO es implementación final)
export default function (pi: ExtensionAPI) {
  registerCommands(pi);   // /clickup config | auth | status
  registerAllTools(pi);   // pi.registerTool() × 14
  pi.on("session_start", ...);   // validar config si existe, precargar workspaces
  pi.on("session_shutdown", ...); // limpiar rate limiter y timers pendientes
}
```

Constraints del contract: la factory es **síncrona** (no arranca procesos ni timers dentro — el `session_start` es el punto seguro para inicializar el rate limiter y hacer el ping de validación). El factory no debe hacer I/O pesado porque algunas invocaciones de pi cargan extensions sin abrir sesión.

## 3. Surface de tools a exponer

### Lista completa (14 tools)

| Tool | Actions | API base |
|---|---|---|
| `clickup_tasks` | get, list, create, update, delete, search (team-level), move, duplicate, add_tag, remove_tag, set_status | v2 |
| `clickup_lists` | get, create (foldered/folderless), update, delete, override_statuses | v2 |
| `clickup_folders` | get, list_by_space, create, update, delete | v2 |
| `clickup_spaces` | get, list_by_team, create, update | v2 |
| `clickup_comments` | list_task, create_task, list_list, create_list | v2 |
| `clickup_checklists` | list, create, update, delete, add_item, update_item, delete_item | v2 |
| `clickup_tags` | list_space, create_space_tag, update_tag, delete_tag, add_to_task, remove_from_task | v2 |
| `clickup_custom_fields` | list_definitions, add_value, remove_value | v2 |
| `clickup_goals` | list, get, create, update, delete, add_key_result, update_key_result | v2 |
| `clickup_webhooks` | list_by_team, create, update, delete | v2 |
| `clickup_docs` | list_by_workspace, get, create, list_pages | v3 |
| `clickup_chat` | list_channels, create_channel, list_messages, post_message, post_reply, react | v3 |
| `clickup_users` | whoami, list_workspace | v2 |
| `clickup_config` | status (muestra rate limit, config activa, scopes detectados) | local |

`[PENDIENTE-RESEARCHER]`: la superficie exacta de acciones por dominio debe validarse contra las 15 references del skill (`/Users/andres.rendon/.pi/agent/skills/use-clickup/references/`) y, si el Researcher encuentra endpoints adicionales (views, time tracking, attachments, members, milestones), se agregan como acciones nuevas dentro del tool del dominio correspondiente o como un tool nuevo — no se asume nada.

### Top 10 críticos vs nice-to-have

Los "más críticos" son las acciones (dentro de los tools), no los tools en sí — porque la granularidad es el tool, la frecuencia es la acción:

**Críticos (el 80% del uso real):**
1. `clickup_tasks.list` (por list y por team — búsqueda global)
2. `clickup_tasks.create`
3. `clickup_tasks.update` (incluye status, fechas, prioridad, tags — vía endpoints dedicados)
4. `clickup_tasks.get`
5. `clickup_lists.list_by_folder` / `.list_by_space` (descubrimiento de contenedores)
6. `clickup_spaces.list_by_team` (necesario para resolver `team_id` en primera interacción)
7. `clickup_comments.create_task`
8. `clickup_checklists.add_item` (subtareas operativas)
9. `clickup_config.status` (diagnóstico sin salir del chat)
10. `clickup_users.whoami` (validación implícita en cada sesión)

**Nice-to-have (v1.1+):** docs y chat (v3, menos uso diario), webhooks (setup, no uso continuo), goals, custom_fields (bloqueado en Free), duplicate/move de tasks, chat reactions.

### Estrategia: dominios agrupados (recomendada)

**Recomendación: 14 tools por dominio con `action` enum interno. NO 1 mega-tool, NO ~60 granulares.**

Justificación:
- **1 mega-tool** con `action: "list"|"create"|...` requeriría un schema TypeBox gigante donde cada parámetro es `Optional` (porque cada action usa params distintos) → el LLM pierde validación cruzada, las descripciones se diluyen, y pi's `/tools` UI no podría habilitar/deshabilitar por capacidad. Además, TypeBox union types para actions con params disjuntos se vuelven ilegibles.
- **~60 tools granulares** (uno por endpoint) infla el system prompt (pi registra todas las tool descriptions) y satura la elección de tool para el LLM. Con 60 opciones, la tasa de tool equivocado sube.
- **14 dominios** es el punto medio: cada tool tiene una descripción enfocada (domain-level guidance con los quirks conocidos: status override, tag endpoints, etc.), schema TypeBox acotado (~10-15 params por tool), y el usuario puede deshabilitar dominios enteros desde `/tools` (ej. deshabilitar `clickup_chat` si no lo usa). El mapeo 1:1 con los archivos de references del skill hace la implementación trazable: `src/tools/tasks.ts` ← `references/api-tasks.md`.
- El `action` enum por dominio es el patrón ya usado en examples de pi (`examples/extensions/todo.ts` usa `StringEnum(["list","add","toggle","clear"])`), es decir, es idiomático para este host.

### Convención de nombres

- **Tool names:** `snake_case`, prefix `clickup_` + dominio en plural (`clickup_tasks`, no `clickup_task`). Confirma el patrón de los ejemplos (`name: "hello"`, `name: "todo"` — short snake_case, lowercase).
- **Labels:** Title Case (`"ClickUp Tasks"`) — es lo que muestra la UI de pi.
- **Actions:** kebab o snake dentro del enum (`"set_status"`, `"add_tag"`), consistente con `"list"|"add"|"toggle"` de todo.ts.

## 4. Diseño del config + TUI

### Schema del config

Ubicación: `~/.config/clickup-pi/config.json` (chmod 600).

```jsonc
{
  "pat": "pk_XXXX...",           // requerido (o vía env CLICKUP_API_KEY)
  "default_team_id": "9012345",  // opcional — workspace default
  "base_url_v2": "https://api.clickup.com/api/v2",
  "base_url_v3": "https://api.clickup.com/api/v3",
  "timeout_ms": 15000,           // por request
  "max_retries": 2,              // para 5xx / network
  "rate_limit_margin": 0.95      // 100/min → 95 effective
}
```

Justificación de la ubicación: `~/.config/` es XDG-compliant, está fuera del agent dir de pi (que los usuarios respaldan/comparten y que podría filtrar el PAT en dotfiles compartidos), y es un path estable multiplataforma desde Node. No usamos `~/.pi/agent/clickup-pi/` porque ese directorio es territorio gestionado por pi (extensions/, skills/, themes/ — agregar subdirs propios ahí viola la convención). Override por env (`CLICKUP_API_KEY`, `CLICKUP_TEAM`) preserva el orden de resolución del skill actual, útil para CI/headless donde no hay TUI.

### Lectura/escritura

- `src/config.ts` lee el JSON con `readFile` + validación manual de campos (no zod — zero deps, D4). Escribe con `writeFile` + `chmod 600`.
- Resolución de credenciales en runtime, en orden:
  1. `env.CLICKUP_API_KEY` (mayor prioridad — permite override temporal sin tocar el archivo)
  2. `~/.config/clickup-pi/config.json` → `pat`
  3. Si no hay ninguna → el tool devuelve error accionable: "Run /clickup auth in the pi TUI, or set CLICKUP_API_KEY".
- `[PENDIENTE-RESEARCHER]`: confirmar si el PAT del usuario actual (ya configurado en su environment) viene como env var o como algo específico de pi — afecta el orden de resolución y la documentación del README.

### TUI mínimo

Se usa `ctx.ui.select()`, `ctx.ui.confirm()`, `ctx.ui.input()` — primitives nativas de pi (tui.md confirma que existen). NO se construyen componentes custom con `ctx.ui.custom()` en v1 (más simple, menos riesgo de focus handling).

Un único comando registrado: `pi.registerCommand("clickup", handler)` — el handler despacha por `args`:

| Comando | Qué muestra / hace |
|---|---|
| `/clickup config` | Muestra config actual: PAT (enmascarado a `pk_…last4`), team default, base URLs, timeout, rate margin. Ofrece cambiar team default (select entre workspaces detectados) y timeout (input numérico). |
| `/clickup auth` | Flujo interactivo: (1) `ctx.ui.input` para el PAT (o acepta el que ya está en env si existe — pregunta "Use CLICKUP_API_KEY from environment?"), (2) valida contra `/v2/user` + `/v2/team`, (3) si OK → `ctx.ui.select` de workspaces para elegir default, (4) guarda config con chmod 600, (5) `ctx.ui.notify` de éxito con scopes detectados. Si falla → error claro sin exponer el PAT. |
| `/clickup status` | Whoami (user.id, email), team default, rate limit actual (usado/restante/reset), scopes detectados, errores recientes (últimos 5). Solo lectura, sin mutación. |

Guard: los tres requieren `ctx.mode === "tui"`; en RPC/print mode, `/clickup config` y `/clickup status` pueden responder como texto plano (pi RPC no puede renderizar dialogs custom — extensions.md lo confirma), pero `/clickup auth` requiere TUI real.

### Patrón de validación del PAT (primer uso)

1. En `session_start` (si config existe): ping **lazy** — NO se hace ping automático al arrancar (latencia + costo de rate limit). En su lugar, la primera llamada a cualquier tool valida implícitamente (401 → error accionable).
2. En `/clickup auth`: ping explícito `GET /v2/user` (devuelve user.id/email, valida el token) y luego `GET /v2/team` (devuelve workspaces, valida scope de lectura de workspace y pobla el selector). Ambos cuentan contra el rate limiter (2 de 100).
3. En `/clickup status`: reusa la respuesta de la última validación; si hay cache < 5 min, no re-ping.

## 5. Manejo de errores y rate limits

### Rate limit (100 req/min por token, compartido entre dispositivos)

- **Ventana deslizante en memoria** (`src/rate-limit.ts`): contador de timestamps de las últimas 60s por proceso. Antes de cada request, si `used >= limit × margin (0.95 → 95)`, la request entra a cola y espera el slot más viejo en expirar (o hasta `timeout_ms`, luego error `RATE_LIMIT_LOCAL`).
- **Headers:** se leen `X-RateLimit-Remaining` y `X-RateLimit-Reset` de cada response si existen y se usan para ajustar el contador local (más preciso que la ventana propia si otro agente consume el mismo token). `[PENDIENTE-RESEARCHER]`: confirmar los nombres exactos de los headers que ClickUp envía en 200 y en 429 (el skill menciona `Retry-After: 60` en el error APP_002 — verificar si también hay headers de remaining/reset).
- **429 remoto:** se respeta `Retry-After` (skill: Retry-After 60s). Se reintenta **una vez** automáticamente dentro de esa espera, comunicando progreso vía `onUpdate` al LLM ("Rate limited, waiting 60s — attempt 1/2"). Si el segundo intento también es 429 → error final con tiempo de espera sugerido. Una espera de 60s dentro de un tool call es larga pero aceptable (los tool calls de pi soportan signals de cancelación — se respeta `signal` para abortar).
- **Nota clave:** el límite es **per-token compartido entre todos los agentes/dispositivos** que usan el mismo PAT (confirmado por el skill). Si Andrés corre dos sesiones de pi con el mismo PAT, la ventana local de cada proceso no ve el consumo del otro → los headers de remaining/reset son el mecanismo corrector.

### Errores comunes → acción

| Código | Significado | Acción del tool |
|---|---|---|
| 401 | PAT inválido/revocado | Error inmediato, sin retry. Mensaje al LLM: "PAT invalid — ask the user to run /clickup auth or set CLICKUP_API_KEY." |
| 403 | Scope insuficiente / tier bloqueado (ej. custom fields en Free) | Sin retry. Mensaje: "Insufficient scope for <domain/action> — re-auth with broader scopes, or this feature is not available on your plan." |
| 404 | Recurso no existe (task/list/space id) | Sin retry. Mensaje: "<Resource> <id> not found — verify the id, or use clickup_lists.list / clickup_spaces.list to discover ids." |
| 429 | Rate limit | Retry-After respetado, 1 retry, luego error final con wait time. |
| 400 | Payload inválido | Sin retry. Mensaje con el campo exacto que falló (ClickUp devuelve err details). |
| 5xx / network | Transitorio | Hasta 2 retries con backoff exponencial + jitter (500ms, 1500ms), respetando `signal`. |
| Timeout | Red lenta | 1 retry, luego error. |

Todos los errores se presentan al LLM como texto estructurado (JSON con `{error: true, code, message, action_hint}`) — nunca como excepciones sin capturar (el tool execution failure de pi se convierte en error result, pero mejor capturarlo y formatearlo nosotros).

### Logging (sin filtrar el PAT)

- **Sin logging persistente por defecto.** Nada en disco salvo el config.
- Si `CLICKUP_PI_DEBUG=1`: log a `~/.config/clickup-pi/logs/debug.log` (mismo chmod 600), con redacción agresiva: el header `Authorization` se reemplaza por `[REDACTED]` antes de serializar; el PAT nunca aparece en messages, errores, ni stack traces (el patrón de redacción vive en `src/errors.ts` y se aplica en un solo punto: el serializador de requests/responses).
- Los mensajes al usuario usan `ctx.ui.notify`; los mensajes al LLM van en el tool result; nada de `console.log` (contamina el transcript de pi).

## 6. Estructura del repo para `pi install`

### Repo GitHub

- **Nombre sugerido:** `pi-clickup`
- **Owner:** `github.com/andresrendon/` — `[PENDIENTE-RESEARCHER]`/decisión de Andrés: confirmar owner y si el repo será público o privado (público facilita `pi install` sin auth extra; privado requiere token de git en la máquina).
- **Ref:** tag semántico por release (`@v0.1.0`) — `pi install git:github.com/<owner>/pi-clickup@v0.1.0` clona y reconcilia al ref indicado.

### Estructura de directorios completa

```
pi-clickup/                        ← repo root (antes: clickup-pi-tool/)
├── package.json
├── tsconfig.json
├── README.md
├── LICENSE
├── .gitignore
├── index.ts                       ← entry point registrado en pi.extensions
├── src/
│   ├── config.ts
│   ├── api.ts
│   ├── rate-limit.ts
│   ├── errors.ts
│   ├── validate.ts
│   ├── tui.ts
│   └── tools/
│       ├── registry.ts
│       ├── shared.ts
│       ├── tasks.ts
│       ├── lists.ts
│       ├── folders.ts
│       ├── spaces.ts
│       ├── comments.ts
│       ├── checklists.ts
│       ├── tags.ts
│       ├── custom-fields.ts
│       ├── goals.ts
│       ├── webhooks.ts
│       ├── docs.ts
│       ├── chat.ts
│       ├── users.ts
│       └── config-tool.ts
└── scripts/
    └── smoke.ts                   ← validación manual: whoami + teams + 1 list
```

### README mínimo

```markdown
# pi-clickup
Full-surface ClickUp API as native pi tools (v2 + v3).

## Install
pi install git:github.com/<owner>/pi-clickup@v0.1.0

## Configure
In pi TUI: /clickup auth   → paste PAT, validate, pick default workspace
           /clickup config → view/edit settings
           /clickup status → whoami, rate limit, scopes
Or set env: CLICKUP_API_KEY, CLICKUP_TEAM

## Tools
clickup_tasks, clickup_lists, clickup_folders, clickup_spaces,
clickup_comments, clickup_checklists, clickup_tags, clickup_custom_fields,
clickup_goals, clickup_webhooks, clickup_docs, clickup_chat,
clickup_users, clickup_config
```

### LICENSE

**MIT** — sugerido: simple, compatible con la naturaleza open del ecosistema pi, sin restricciones para fork/adaptación. Si Andrés prefiere restringir derivados, Apache-2.0 añade grants de patente explícitos — decisión suya (§8).

### `.gitignore`

```
node_modules/
dist/
.env
*.log
.DS_Store
```

### Manifest requerido por pi

Lo que pi espera en `package.json` (confirmado en docs/packages.md):
- `name`, `version`, `type: "module"`
- `keywords: ["pi-package", ...]`
- `pi.extensions: ["./index.ts"]`
- `peerDependencies` con los 5 host-provided packages en `"*"` (NUNCA en `dependencies`)
- `pi` también acepta `skills`, `prompts`, `themes` — no se usan en v1 (el skill `use-clickup` existente sigue vivo como capa de conocimiento; si en el futuro se quiere un skill de apoyo dentro del package, se agrega `pi.skills`).
- No se requiere lockfile (cero deps), pero `package-lock.json` no hace daño si aparece tras un `npm install` accidental — se ignora en .gitignore NO (lockfile de peers es vacío, mejor no versionarlo si está vacío; decisión del Coder).

## 7. Plan de implementación (orden)

1. **Init repo** — `mkdir pi-clickup && cd pi-clickup && git init`. Crear `package.json`, `tsconfig.json`, `LICENSE`, `.gitignore`, `README.md` (stub). Verificar `tsc --noEmit` pasa con solo el stub.
2. **`src/config.ts`** — schema, load/save, chmod 600, resolución env > file. Test manual: guardar y leer config de prueba.
3. **`src/errors.ts`** — taxonomía y redacción. Independiente de config.
4. **`src/rate-limit.ts`** — ventana deslizante + cola. Independiente de config (parámetros inyectados).
5. **`src/api.ts`** — cliente fetch: header raw (quirk crítico: `Authorization: <token>` SIN Bearer), base URLs, timeout, retries, integración con rate-limit y errors. **Depende de: 2, 3, 4.**
6. **`src/validate.ts`** — pings /v2/user + /v2/team. Depende de 5.
7. **`src/tui.ts` + registro de comando `/clickup`** en `index.ts` — config, auth, status usando ctx.ui primitives. Depende de 2, 6.
8. **`src/tools/shared.ts` + `src/tools/registry.ts`** — helper de schemas (team_id default, paginación), shaping de results (`{content:[{type:"text",text}], details}`), factory `registerAllTools`. Depende de 5.
9. **`src/tools/spaces.ts` + `src/tools/users.ts`** — los dos más simples (discovery). Depende de 8. ← Verificación end-to-end: `pi install ./local-package` y probar `clickup_spaces.list_by_team` contra API real.
10. **`src/tools/lists.ts` + `src/tools/folders.ts`** — dependen de spaces para ids. Paralelizable entre sí.
11. **`src/tools/tasks.ts`** — el más grande (~200 líneas). Depende de 9-10 para probar ids reales.
12. **`src/tools/comments.ts`, `checklists.ts`, `tags.ts`** — sobre tasks. Paralelizables entre sí.
13. **`src/tools/goals.ts`, `custom-fields.ts`, `webhooks.ts`** — dominios de menor uso. Paralelizables.
14. **`src/tools/docs.ts`, `chat.ts` (v3)** — base URL distinta. Paralelizables.
15. **`src/tools/config-tool.ts`** — status desde el LLM. Depende de 6.
16. **`scripts/smoke.ts`** — script manual: whoami → teams → spaces → una list → un task. Verificación final.
17. **Tag v0.1.0 + README final + `pi install git:...` desde otra máquina o directorio limpio.**

### Paralelización

- **Pasos 2, 3, 4** son totalmente independientes entre sí (pueden correr en paralelo).
- **Pasos 9-14** son 10 archivos de dominio que, una vez terminado el paso 8, se pueden implementar en paralelo (cada uno solo necesita `api.ts` + `shared.ts` + su reference file del skill como spec).
- **Pasos 5→6→7→8** son la cadena crítica secuencial.

### Puntos de decisión que requieren input de Andrés

- Después del paso 1: confirmar owner de GitHub y visibilidad del repo (público/privado).
- Después del paso 9 (primera prueba end-to-end): validar que la resolución de `team_id` default funciona con su PAT real y sus workspaces.
- Después del paso 14: decidir si v3 (docs/chat) entra en v0.1.0 o se dejan para v0.2 (pueden deshabilitarse por defecto desde pi /tools si molestan).
- Antes del paso 17: confirmar si el skill `use-clickup` se mantiene, se deshabilita, o se reescribe para apuntar al tool nuevo.

## 8. Riesgos y preguntas abiertas

### Preguntas que NO puedo decidir solo (requieren Andrés)

1. **Owner y visibilidad del repo GitHub.** Público simplifica `pi install` (sin auth extra); privado exige token de git en cada máquina que instale.
2. **¿El PAT ya configurado en el environment de Andrés está como env var `CLICKUP_API_KEY` o en algún mecanismo propio de pi?** Afecta el orden de resolución y el onboarding del README. El Researcher debe auditarlo.
3. **Scopes del PAT actual.** Si es un PAT personal sin scopes de admin (webhooks, goals, custom fields), varias acciones devolverán 403 en la primera prueba. ¿Re-crear el PAT con scopes más amplios, o convivir con 403s?
4. **¿Se mantiene el skill `use-clickup` en paralelo o se depreca?** Si coexisten, el LLM podría mezclar rutas (skill scripts Python vs tool nativo). Recomiendo: mantener el skill como documentación de quirks, pero mover el uso diario al tool; deshabilitar el skill de la auto-invocación cuando el tool esté estable.
5. **Margen del rate limit:** ¿95/min efectivo (0.95) es suficiente, o prefiere un margen más conservador (90) dado que el límite es compartido entre dispositivos?
6. **Custom Fields en Free:** ¿se incluyen en el tool aunque devuelvan 403 siempre, o se excluyen del registry hasta tener plan pago?
7. **Nombre del directorio local vs nombre del repo:** el folder ya existe como `clickup-pi-tool/` pero el package/repo propuesto es `pi-clickup/`. ¿Renombrar el folder o mantener el folder y solo usar el nombre en el repo remoto?

### Riesgos de implementación

1. **Quirk del header Authorization** — ClickUp rechaza `Bearer <token>` para PATs; si el Coder implementa el header con Bearer por inercia de otros APIs, todo fallará con 401 confuso. El cliente debe tener el header raw como default inamovible y documentado en `src/api.ts`.
2. **Quirk del status override de listas** — las rutas CRUD de statuses standalone están muertas (skill: solo `PUT /list/{id}` con `override_statuses:true` + array completo). Si el Coder sigue la doc genérica de ClickUp en vez del skill, implementará endpoints muertos. El Researcher debe validar esto contra el live API.
3. **Rate limit compartido per-token** — si Andrés corre múltiples sesiones de pi u otros scripts Python (skill) con el mismo PAT, el limiter local de este tool subestima el consumo real. Los headers de remaining/reset son el mecanismo corrector, pero dependen de que ClickUp los envíe consistentemente `[PENDIENTE-RESEARCHER]`.
4. **Pi carga .ts vía jiti sin build** — los imports deben ser relativos y sin path aliases; `typebox` se resuelve via peerDependencies mapeadas por pi. Si el Coder agrega un import absurdo (`@/src/...`), romperá silenciosamente en `pi install` aunque pase tsc local.
5. **`ctx.ui.input` para el PAT** — el PAT quedará visible en pantalla mientras se tipea (los inputs de pi no enmascaran por defecto). No hay alternativa nativa confirmada; mitigación: documentar que el flujo recomendado es pegar en una vez y no dejarlo en el buffer del terminal. `[PENDIENTE-RESEARCHER]` verificar si pi ofrece input enmascarado.
6. **La espera de 60s en 429** — dentro de un tool call puede verse como hang. Mitigación: `onUpdate` con progreso y soporte de `signal` para abortar. Si el LLM/usuario aborta, la request se cancela limpiamente.
7. **Webhooks: URL allowlist en Free** — crear un webhook hacia `localhost`/túnel temporal devolverá OAUTH_194. El tool debe propagar el error con explicación, no esconderlo.
8. **Custom Fields bloqueado en Free** — riesgo de que el Coder construya el tool completo y todas las pruebas devuelvan 403. Mitigación: pruebas con mocks o skip si el tier lo bloquea, y el tool de todas formas presente el error accionable (re-auth con scopes, o upgrade de plan).

---

### Critical Files for Implementation

- `/Users/andres.rendon/.pi/agent/skills/use-clickup/references/error-handling.md` — fuente de verdad para taxonomía de errores, rate limit y quirks que el tool debe replicar.
- `/Users/andres.rendon/.pi/agent/skills/use-clickup/references/api-tasks.md` — el dominio más grande (tasks), base del tool `clickup_tasks`.
- `/Users/andres.rendon/.pi/agent/install/releases/1.3.0/node_modules/@earendil-works/pi-coding-agent/examples/extensions/hello.ts` — patrón mínimo de tool registration (defineTool + TypeBox + execute return shape).
- `/Users/andres.rendon/.pi/agent/install/releases/1.3.0/node_modules/@earendil-works/pi-coding-agent/examples/extensions/todo.ts` — patrón de tool con `action` enum interno (acción = `StringEnum(["list","add","toggle","clear"])`).
- `/Users/andres.rendon/.pi/agent/install/releases/1.3.0/node_modules/@earendil-works/pi-coding-agent/docs/packages.md` — reglas del package manifest para `pi install` (peerDependencies, pi.extensions).
- `/Users/andres.rendon/.pi/agent/install/releases/1.3.0/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md` — contrato de la extension factory, registerTool, registerCommand, hooks.
- `/Users/andres.rendon/.pi/agent/install/releases/1.3.0/node_modules/@earendil-works/pi-coding-agent/docs/tui.md` — primitives de ctx.ui para los diálogos de `/clickup auth` y `/clickup config`.

---

## Reporte final

**Ruta del PLAN.md:** `/Users/andres.rendon/Documents/Projects/clickup-pi-tool/PLAN.md` (escrito por el orquestador a partir del output del agente).

**Resumen en 5 bullets:**
- Extensión pi nativa (`pi-clickup`) instalable con `pi install git:github.com/<owner>/pi-clickup@vX.Y`, con 14 tools de dominio (tasks, lists, folders, spaces, comments, checklists, tags, custom-fields, goals, webhooks, docs, chat, users, config) cubriendo v2+v3 de la API, y un comando `/clickup` (config/auth/status) como única superficie de TUI.
- Estrategia de tools: dominios agrupados con `action` enum interno — ni mega-tool ni 60 granulares; cada tool mapea 1:1 con un reference file del skill existente, lo que hace la implementación trazable.
- Config externa (`~/.config/clickup-pi/config.json`, chmod 600) con resolución env > file; PAT validado contra `/v2/user` + `/v2/team`; header de auth es el token RAW sin Bearer (quirk crítico ya confirmado por el skill).
- Rate limit manejado con ventana deslizante local (100/min × 0.95 de margen), corregida con headers de remaining/reset del servidor, y `Retry-After` respetado en 429 con 1 retry y progreso vía `onUpdate`.
- Plan de 17 pasos: cadena crítica secuencial (config → errors → rate-limit → client → validate → TUI → registry) y 10 archivos de dominio paralelizables una vez exista el framework; verificación end-to-end en el paso 9 con `pi install ./local-package` contra la API real.

**Los 3 puntos más críticos donde necesito tu opinión (o la de Andrés):**
1. **Scopes del PAT actual y su mecanismo de provisión** — si el PAT carece de scopes para webhooks/goals/custom-fields, o si se inyecta por algo distinto a `CLICKUP_API_KEY`, el diseño de validación y el README cambian. Requiere la auditoría del Researcher antes de fijar el paso 6 del plan.
2. **Cobertura v3 (docs/chat) en v0.1.0 o defer a v0.2** — son ~30% de la superficie total y la única parte que usa la base URL v3; incluirlas agranda el alcance inicial. Si se posponen, el plan pierde 2 pasos y el riesgo de bloqueo por API v3 desaparece del release inicial.
3. **Destino del skill `use-clickup`** — coexistencia vs deprecación afecta la experiencia del LLM (dos fuentes de verdad para el mismo dominio). Mi recomendación: mantener el skill como documentación de quirks, deshabilitarlo de la invocación automática cuando el tool esté estable, pero es una decisión de producto que no debería tomarla el Coder.
