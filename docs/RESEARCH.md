# RESEARCH.md — Audita completa de la ClickUp API (PAT surface)
**Fecha:** 2026-10-19 · **Investigador:** Researcher (web + docs oficiales) · **Consumidor:** Planner del tool clickup-pi-tool

> Fuentes primarias: `https://developer.clickup.com/llms.txt` (índice maestro, extraído íntegro),
> docs oficiales y OpenAPI definition embebida en `reference/getaccesstoken.md`.
> Cada endpoint enlaza a su página de referencia canónica (`developer.clickup.com/reference/<operationId>.md`).
> Todo lo que no pude confirmar se marca `[VERIFICAR]`.

---

## 1. Resumen ejecutivo

1. La API pública de ClickUp sigue dividida en **v2 (núcleo: tasks/lists/folders/spaces/goals/time/views/webhooks/users)** y **v3 (Docs, Chat, attachments v3, audit logs, ACL, move-task)**. No hay anuncio de deprecación de v2.
2. **No existe un sistema de scopes granulares** — ni para PAT ni para OAuth. Un token actúa como el usuario que lo creó, con TODOS sus permisos. El "scope" real es el rol del usuario + el plan del workspace.
3. Un PAT (`pk_...`, header `Authorization: pk_...` SIN Bearer, no expira) puede hacer **prácticamente todo lo que hace su usuario en la UI**, salvo administrar usuarios/guests si el workspace no es Enterprise, y salvo operaciones OAuth-flow (instalar apps, actuar por otros usuarios).
4. Rate limit: **100 req/min por token** en Free/Unlimited/Business; 1,000 en Business Plus; 10,000 en Enterprise. Headers `X-RateLimit-*` solo en 429.
5. Endpoints completamente ausentes de la API pública: **Whiteboards, Dashboards/widgets, Embeds, Reporting, Bulk task updates** (no hay PATCH masivo).
6. La skill `use-clickup` cubre ~40 de ~171 endpoints (23%), con 6 workflows scriptados. **Gaps mayores: Time Tracking (13 endpoints), Goals (8), Views (12), Templates (3), relaciones de tareas, adjuntos, guests/users, grupos de usuario, v3 move/estimates.**
7. Chat v3 está marcado como **experimental** ("subject to change at any time") — diseñar el tool con capa de tolerancia.
8. Webhooks: disponibles con PAT, firmados con HMAC-SHA256 hex en `X-Signature`, secret devuelto al crear; el webhook muere si se desactiva el usuario creador.
9. Los datos de Docs v3 tienen limitaciones de formato severas (no checklists, banners, columnas, embeds, colores).
10. **Recomendación:** tool unificado con routing v2/v3, client que respete el header PAT sin Bearer, rate-limit budget 100/min, y que exponga el 100% de la matriz (§3) con plan-gating explícito. Considerar también el MCP server oficial de ClickUp como alternativa de integración (§9).

---

## 2. Estado de la API (versiones)

| Tema | Estado a 2026-10-19 | Fuente |
|---|---|---|
| Versión vigente | **v2 y v3 coexisten**; v3 es "una extensión", no reemplazo | developer.clickup.com/docs/general-v2-v3-api.md |
| Alcance v2 | Tasks, Lists, Folders, Spaces, Goals, Webhooks, Time Tracking, Views, Templates, Users, Guests, Groups, Roles, Comments, Checklists, Tags, Custom Fields, Attachments (legacy upload) | llms.txt "ClickUp API v2 Reference" |
| Alcance v3 | Docs, Chat, Attachments (get/create), Audit Logs, Privacy/ACL, Move task, Time estimates by user | llms.txt "ClickUp Public API v3" |
| Deprecación de v2 | **No hay fecha anunciada**. No aparece ningún banner ni página de deprecación en llms.txt | llms.txt (ausencia) |
| Deprecaciones parciales | 4 endpoints legacy de time tracking (`Get tracked time`, `Track time`, `Edit time tracked`, `Delete time tracked`) están marcados "legacy, recomendamos Time Tracking API" pero siguen activos | llms.txt Time Tracking (Legacy) |
| FAQ desactualizada | El FAQ dice "no es posible mover una tarea entre listas", pero v3 publica `Move a task to a new List` (3 variantes). El FAQ predice v3 → el FAQ no se ha mantenido. Usar llms.txt/reference como verdad | docs/faq.md vs llms.txt Tasks v3 |
| OpenAPI specs | Hay specs descargables por versión (v2 y v3) para Postman/codegen. URLs exactas no visibles en el extracto `[VERIFICAR: developer.clickup.com/docs/open-api-spec.md enlaces]` | docs/open-api-spec.md |
| Cambios últimos 12 meses | No hay changelog público en developer.clickup.com (no aparece en llms.txt). Indicios de novedades: endpoints v3 (move task, estimates by user, attachments v3), `Get Workspace seats`, `Get Workspace Plan`, Move Folder, Merge Tasks, Custom Task Types con `applied_objects` (scoping de CF a task types) `[VERIFICAR fechas]` | llms.txt |
| MCP oficial | ClickUp publica un **MCP server propio** + guía de setup + lista de tools. Relevante como alternativa al tool custom `[VERIFICAR cobertura de tools]` | docs/connect-an-ai-assistant-to-clickups-mcp-server.md, docs/mcp-tools.md |

**URLs y headers:**
- Base: `https://api.clickup.com/api` (servers en OpenAPI: `https://api.clickup.com/api`; paths llevan `/v2/...` o `/v3/...`).
- v2: `https://api.clickup.com/api/v2/...` · v3: `https://api.clickup.com/api/v3/...`
- Header PAT: `Authorization: pk_...` (sin `Bearer`) — el `Bearer` falla con PATs (bug/quirk confirmado también por la skill).
- Header OAuth: `Authorization: Bearer {token}`.
- `Content-Type: application/json` SIEMPRE (form-encoded no soportado del todo); excepción: adjuntos = `multipart/form-data`.

---

## 3. Matriz de endpoints (100% del surface público)

Convenciones: **v2** = `/api/v2`, **v3** = `/api/v3`. `PAT` = ¿usable con Personal Access Token? (sí en todo lo que el usuario pueda en la UI;OAuth-only no existe). `Plan` = restricción de plan documentada. Rutas marcadas `[VERIFICAR]` = operationId confirmado pero la ruta exacta no apareció en los extractos; confirmar en su página de reference antes de implementar. `Ref` = página canónica del endpoint.

### 3.1 Workspaces / Auth (v2)

| # | Operación | Método + Ruta | Ref | PAT | Plan |
|---|---|---|---|---|---|
| 1 | Get Access Token (OAuth flow) | POST `/v2/oauth/token` | [reference/getaccesstoken.md](https://developer.clickup.com/reference/getaccesstoken.md) | No usa — solo OAuth apps | Todos (crear app: owner/admin) |
| 2 | Get Authorized User | GET `/v2/user` | [reference/getauthorizeduser.md](https://developer.clickup.com/reference/getauthorizeduser.md) | Sí | Todos |
| 3 | Get Authorized Workspaces | GET `/v2/team` | [reference/getauthorizedteams.md](https://developer.clickup.com/reference/getauthorizedteams.md) | Sí | Todos |
| 4 | Get Workspace seats | GET `/v2/workspaces/{workspace_id}/seats` `[VERIFICAR ruta]` | [reference/getworkspaceseats.md](https://developer.clickup.com/reference/getworkspaceseats.md) | Sí | Todos |
| 5 | Get Workspace Plan | GET `/v2/workspaces/{workspace_id}/plan` `[VERIFICAR ruta]` | [reference/getworkspaceplan.md](https://developer.clickup.com/reference/getworkspaceplan.md) | Sí | Todos |

### 3.2 Spaces (v2)

| # | Operación | Método + Ruta | Ref | PAT | Plan |
|---|---|---|---|---|---|
| 6 | Get Spaces | GET `/v2/team/{team_id}/space` | [reference/getspaces.md](https://developer.clickup.com/reference/getspaces.md) | Sí | Todos |
| 7 | Create Space | POST `/v2/team/{team_id}/space` | [reference/createspace.md](https://developer.clickup.com/reference/createspace.md) | Sí | Todos |
| 8 | Get Space | GET `/v2/space/{space_id}` | [reference/getspace.md](https://developer.clickup.com/reference/getspace.md) | Sí | Todos |
| 9 | Update Space | PUT `/v2/space/{space_id}` (`admin_can_manage` solo Enterprise) | [reference/updatespace.md](https://developer.clickup.com/reference/updatespace.md) | Sí | Todos (1 param Enterprise) |
| 10 | Delete Space | DELETE `/v2/space/{space_id}` | [reference/deletespace.md](https://developer.clickup.com/reference/deletespace.md) | Sí | Todos |

### 3.3 Folders (v2) — incluye subfolders y move

| # | Operación | Método + Ruta | Ref | PAT | Plan |
|---|---|---|---|---|---|
| 11 | Get Folders | GET `/v2/space/{space_id}/folder` | [reference/getfolders.md](https://developer.clickup.com/reference/getfolders.md) | Sí | Todos (subfolders: soporte por plan `[VERIFICAR]`) |
| 12 | Create Folder | POST `/v2/space/{space_id}/folder` (`parent_folder_id` opcional) | [reference/createfolder.md](https://developer.clickup.com/reference/createfolder.md) | Sí | Todos (subfolder opcional) |
| 13 | Get Folder | GET `/v2/folder/{folder_id}` | [reference/getfolder.md](https://developer.clickup.com/reference/getfolder.md) | Sí | Todos |
| 14 | Update Folder | PUT `/v2/folder/{folder_id}` (solo renombra) | [reference/updatefolder.md](https://developer.clickup.com/reference/updatefolder.md) | Sí | Todos |
| 15 | Delete Folder | DELETE `/v2/folder/{folder_id}` | [reference/deletefolder.md](https://developer.clickup.com/reference/deletefolder.md) | Sí | Todos |
| 16 | Create Folder from template | POST `/v2/space/{space_id}/folder` + template `[VERIFICAR ruta]` | [reference/createfolderfromtemplate.md](https://developer.clickup.com/reference/createfolderfromtemplate.md) | Sí | Todos |
| 17 | Move Folder | PUT/POST `/v2/folder/{folder_id}/...` `[VERIFICAR ruta]` | [reference/movefolder.md](https://developer.clickup.com/reference/movefolder.md) | Sí | Todos |

### 3.4 Lists (v2) — incluye templates y multi-list

| # | Operación | Método + Ruta | Ref | PAT | Plan |
|---|---|---|---|---|---|
| 18 | Get Lists | GET `/v2/folder/{folder_id}/list` | [reference/getlists.md](https://developer.clickup.com/reference/getlists.md) | Sí | Todos |
| 19 | Create List | POST `/v2/folder/{folder_id}/list` | [reference/createlist.md](https://developer.clickup.com/reference/createlist.md) | Sí | Todos |
| 20 | Get Folderless Lists | GET `/v2/space/{space_id}/list` | [reference/getfolderlesslists.md](https://developer.clickup.com/reference/getfolderlesslists.md) | Sí | Todos |
| 21 | Create Folderless List | POST `/v2/space/{space_id}/list` | [reference/createfolderlesslist.md](https://developer.clickup.com/reference/createfolderlesslist.md) | Sí | Todos |
| 22 | Get List | GET `/v2/list/{list_id}` | [reference/getlist.md](https://developer.clickup.com/reference/getlist.md) | Sí | Todos |
| 23 | Update List | PUT `/v2/list/{list_id}` | [reference/updatelist.md](https://developer.clickup.com/reference/updatelist.md) | Sí | Todos |
| 24 | Delete List | DELETE `/v2/list/{list_id}` | [reference/deletelist.md](https://developer.clickup.com/reference/deletelist.md) | Sí | Todos |
| 25 | Add Task To List | POST `/v2/list/{list_id}/task/{task_id}` | [reference/addtasktolist.md](https://developer.clickup.com/reference/addtasktolist.md) | Sí | Requiere ClickApp "Tasks in Multiple Lists" |
| 26 | Remove Task From List | DELETE `/v2/list/{list_id}/task/{task_id}` | [reference/removetaskfromlist.md](https://developer.clickup.com/reference/removetaskfromlist.md) | Sí | Ídem; no se puede quitar de la home list |
| 27 | Create List From Template (Folder) | POST `/v2/folder/{folder_id}/list/{template_id}` `[VERIFICAR]` | [reference/createfolderlistfromtemplate.md](https://developer.clickup.com/reference/createfolderlistfromtemplate.md) | Sí | Todos |
| 28 | Create List From Template (Space) | POST `/v2/space/{space_id}/list/{template_id}` `[VERIFICAR]` | [reference/createspacelistfromtemplate.md](https://developer.clickup.com/reference/createspacelistfromtemplate.md) | Sí | Todos |

### 3.5 Tasks (v2) — CRUD + búsqueda + merge + time-in-status

| # | Operación | Método + Ruta | Ref | PAT | Plan |
|---|---|---|---|---|---|
| 29 | Get Tasks (de List) | GET `/v2/list/{list_id}/task` — 100/page | [reference/gettasks.md](https://developer.clickup.com/reference/gettasks.md) | Sí | Todos |
| 30 | Create Task | POST `/v2/list/{list_id}/task` | [reference/createtask.md](https://developer.clickup.com/reference/createtask.md) | Sí | Todos |
| 31 | Get Task | GET `/v2/task/{task_id}` | [reference/gettask.md](https://developer.clickup.com/reference/gettask.md) | Sí | Todos |
| 32 | Update Task | PUT `/v2/task/{task_id}` (NO actualiza custom fields) | [reference/updatetask.md](https://developer.clickup.com/reference/updatetask.md) | Sí | Todos |
| 33 | Delete Task | DELETE `/v2/task/{task_id}` | [reference/deletetask.md](https://developer.clickup.com/reference/deletetask.md) | Sí | Todos |
| 34 | Get Filtered Team Tasks | GET `/v2/team/{team_id}/task` — 100/page | [reference/getfilteredteamtasks.md](https://developer.clickup.com/reference/getfilteredteamtasks.md) | Sí | Todos |
| 35 | Merge Tasks | POST `/v2/task/{task_id}/merge` `[VERIFICAR ruta]` | [reference/mergetasks.md](https://developer.clickup.com/reference/mergetasks.md) | Sí | Todos |
| 36 | Get Task's Time in Status | GET `/v2/task/{task_id}/time_in_status` `[VERIFICAR ruta]` | [reference/gettaskstimeinstatus.md](https://developer.clickup.com/reference/gettaskstimeinstatus.md) | Sí | Requiere ClickApp Total Time in Status |
| 37 | Get Bulk Tasks' Time in Status | POST `/v2/task/time_in_status/bulk` `[VERIFICAR ruta]` | [reference/getbulktaskstimeinstatus.md](https://developer.clickup.com/reference/getbulktaskstimeinstatus.md) | Sí | Ídem |
| 38 | Create Task From Template | POST `/v2/list/{list_id}/task` + `template_id` `[VERIFICAR]` | [reference/createtaskfromtemplate.md](https://developer.clickup.com/reference/createtaskfromtemplate.md) | Sí | Todos |

### 3.6 Task Checklists (v2)

| # | Operación | Método + Ruta | Ref | PAT | Plan |
|---|---|---|---|---|---|
| 39 | Create Checklist | POST `/v2/task/{task_id}/checklist` | [reference/createchecklist.md](https://developer.clickup.com/reference/createchecklist.md) | Sí | Todos |
| 40 | Edit Checklist | PUT `/v2/checklist/{checklist_id}` | [reference/editchecklist.md](https://developer.clickup.com/reference/editchecklist.md) | Sí | Todos |
| 41 | Delete Checklist | DELETE `/v2/checklist/{checklist_id}` | [reference/deletechecklist.md](https://developer.clickup.com/reference/deletechecklist.md) | Sí | Todos |
| 42 | Create Checklist Item | POST `/v2/checklist/{checklist_id}/checklist_item` | [reference/createchecklistitem.md](https://developer.clickup.com/reference/createchecklistitem.md) | Sí | Todos |
| 43 | Edit Checklist Item | PUT `/v2/checklist_item/{checklist_item_id}` | [reference/editchecklistitem.md](https://developer.clickup.com/reference/editchecklistitem.md) | Sí | Todos |
| 44 | Delete Checklist Item | DELETE `/v2/checklist_item/{checklist_item_id}` | [reference/deletechecklistitem.md](https://developer.clickup.com/reference/deletechecklistitem.md) | Sí | Todos |

### 3.7 Task Relationships (v2) — dependencies + links

| # | Operación | Método + Ruta | Ref | PAT | Plan |
|---|---|---|---|---|---|
| 45 | Add Dependency | POST `/v2/task/{task_id}/dependency` (`wait_for`/`depend_on`) | [reference/adddependency.md](https://developer.clickup.com/reference/adddependency.md) | Sí | Todos |
| 46 | Delete Dependency | DELETE `/v2/task/{task_id}/dependency` | [reference/deletedependency.md](https://developer.clickup.com/reference/deletedependency.md) | Sí | Todos |
| 47 | Add Task Link | POST `/v2/task/{task_id}/link` | [reference/addtasklink.md](https://developer.clickup.com/reference/addtasklink.md) | Sí | Todos (solo task→task) |
| 48 | Delete Task Link | DELETE `/v2/task/{task_id}/link` | [reference/deletetasklink.md](https://developer.clickup.com/reference/deletetasklink.md) | Sí | Todos |

### 3.8 Comments (v2) — task/list/chat-view + threads

| # | Operación | Método + Ruta | Ref | PAT | Plan |
|---|---|---|---|---|---|
| 49 | Get Task Comments | GET `/v2/task/{task_id}/comment` — 25/page | [reference/gettaskcomments.md](https://developer.clickup.com/reference/gettaskcomments.md) | Sí | Todos |
| 50 | Create Task Comment | POST `/v2/task/{task_id}/comment` | [reference/createtaskcomment.md](https://developer.clickup.com/reference/createtaskcomment.md) | Sí | Todos |
| 51 | Get Chat View Comments | GET `/v2/chat/view/{view_id}/comment` `[VERIFICAR ruta]` | [reference/getchatviewcomments.md](https://developer.clickup.com/reference/getchatviewcomments.md) | Sí | Todos |
| 52 | Create Chat View Comment | POST `/v2/chat/view/{view_id}/comment` `[VERIFICAR ruta]` | [reference/createchatviewcomment.md](https://developer.clickup.com/reference/createchatviewcomment.md) | Sí | Todos |
| 53 | Get List Comments | GET `/v2/list/{list_id}/comment` — la skill documenta 500 roto `[VERIFICAR]` | [reference/getlistcomments.md](https://developer.clickup.com/reference/getlistcomments.md) | Sí | Todos |
| 54 | Create List Comment | POST `/v2/list/{list_id}/comment` | [reference/createlistcomment.md](https://developer.clickup.com/reference/createlistcomment.md) | Sí | Todos |
| 55 | Update Comment | PUT `/v2/comment/{comment_id}` (contenido, asignar, resolver) | [reference/updatecomment.md](https://developer.clickup.com/reference/updatecomment.md) | Sí | Todos |
| 56 | Delete Comment | DELETE `/v2/comment/{comment_id}` | [reference/deletecomment.md](https://developer.clickup.com/reference/deletecomment.md) | Sí | Todos |
| 57 | Get Threaded Comments | GET `/v2/task/{task_id}/comment/{comment_id}/thread` `[VERIFICAR]` | [reference/getthreadedcomments.md](https://developer.clickup.com/reference/getthreadedcomments.md) | Sí | Todos |
| 58 | Create Threaded Comment | POST `/v2/task/{task_id}/comment/{comment_id}` `[VERIFICAR]` | [reference/createthreadedcomment.md](https://developer.clickup.com/reference/createthreadedcomment.md) | Sí | Todos |

### 3.9 Custom Fields (v2) — lectura + set/unset valor

| # | Operación | Método + Ruta | Ref | PAT | Plan |
|---|---|---|---|---|---|
| 59 | Get List Custom Fields | GET `/v2/list/{list_id}/field` | [reference/getaccessiblecustomfields.md](https://developer.clickup.com/reference/getaccessiblecustomfields.md) | Sí | Todos |
| 60 | Get Folder Custom Fields | GET `/v2/folder/{folder_id}/field` `[VERIFICAR]` | [reference/getfolderavailablefields.md](https://developer.clickup.com/reference/getfolderavailablefields.md) | Sí | Todos |
| 61 | Get Space Custom Fields | GET `/v2/space/{space_id}/field` `[VERIFICAR]` | [reference/getspaceavailablefields.md](https://developer.clickup.com/reference/getspaceavailablefields.md) | Sí | Todos |
| 62 | Get Workspace Custom Fields | GET `/v2/team/{team_id}/field` `[VERIFICAR]` | [reference/getteamavailablefields.md](https://developer.clickup.com/reference/getteamavailablefields.md) | Sí | Todos |
| 63 | Set Custom Field Value | POST `/v2/task/{task_id}/field/{field_id}` | [reference/setcustomfieldvalue.md](https://developer.clickup.com/reference/setcustomfieldvalue.md) | Sí | Free: máx 60 usos acumulados por workspace |
| 64 | Remove Custom Field Value | DELETE `/v2/task/{task_id}/field/{field_id}` | [reference/removecustomfieldvalue.md](https://developer.clickup.com/reference/removecustomfieldvalue.md) | Sí | Todos |

### 3.10 Custom Task Types (v2)

| # | Operación | Método + Ruta | Ref | PAT | Plan |
|---|---|---|---|---|---|
| 65 | Get Custom Task Types | GET `/v2/team/{team_id}/custom_items` `[VERIFICAR]` | [reference/getcustomitems.md](https://developer.clickup.com/reference/getcustomitems.md) | Sí | Todos |

### 3.11 Tags (v2) — espacio + por tarea

| # | Operación | Método + Ruta | Ref | PAT | Plan |
|---|---|---|---|---|---|
| 66 | Get Space Tags | GET `/v2/space/{space_id}/tag` | [reference/getspacetags.md](https://developer.clickup.com/reference/getspacetags.md) | Sí | Todos |
| 67 | Create Space Tag | POST `/v2/space/{space_id}/tag` | [reference/createspacetag.md](https://developer.clickup.com/reference/createspacetag.md) | Sí | Todos |
| 68 | Edit Space Tag | PUT `/v2/space/{space_id}/tag/{tag_name}` | [reference/editspacetag.md](https://developer.clickup.com/reference/editspacetag.md) | Sí | Todos |
| 69 | Delete Space Tag | DELETE `/v2/space/{space_id}/tag/{tag_name}` | [reference/deletespacetag.md](https://developer.clickup.com/reference/deletespacetag.md) | Sí | Todos |
| 70 | Add Tag To Task | POST `/v2/task/{task_id}/tag/{tag_name}` | [reference/addtagtotask.md](https://developer.clickup.com/reference/addtagtotask.md) | Sí | Todos |
| 71 | Remove Tag From Task | DELETE `/v2/task/{task_id}/tag/{tag_name}` | [reference/removetagfromtask.md](https://developer.clickup.com/reference/removetagfromtask.md) | Sí | Todos |

### 3.12 Goals + Key Results (v2)

| # | Operación | Método + Ruta | Ref | PAT | Plan |
|---|---|---|---|---|---|
| 72 | Get Goals | GET `/v2/team/{team_id}/goal` | [reference/getgoals.md](https://developer.clickup.com/reference/getgoals.md) | Sí | Todos |
| 73 | Create Goal | POST `/v2/team/{team_id}/goal` | [reference/creategoal.md](https://developer.clickup.com/reference/creategoal.md) | Sí | Todos |
| 74 | Get Goal | GET `/v2/goal/{goal_id}` | [reference/getgoal.md](https://developer.clickup.com/reference/getgoal.md) | Sí | Todos |
| 75 | Update Goal | PUT `/v2/goal/{goal_id}` | [reference/updategoal.md](https://developer.clickup.com/reference/updategoal.md) | Sí | Todos |
| 76 | Delete Goal | DELETE `/v2/goal/{goal_id}` | [reference/deletegoal.md](https://developer.clickup.com/reference/deletegoal.md) | Sí | Todos |
| 77 | Create Key Result | POST `/v2/goal/{goal_id}/key_result` | [reference/createkeyresult.md](https://developer.clickup.com/reference/createkeyresult.md) | Sí | Todos |
| 78 | Edit Key Result | PUT `/v2/key_result/{key_result_id}` | [reference/editkeyresult.md](https://developer.clickup.com/reference/editkeyresult.md) | Sí | Todos |
| 79 | Delete Key Result | DELETE `/v2/key_result/{key_result_id}` | [reference/deletekeyresult.md](https://developer.clickup.com/reference/deletekeyresult.md) | Sí | Todos |

### 3.13 Time Tracking (v2, nuevo modelo) — 13 endpoints

| # | Operación | Método + Ruta | Ref | PAT | Plan |
|---|---|---|---|---|---|
| 80 | Get time entries (rango fechas) | GET `/v2/team/{team_id}/time_entries` (default: últimos 30 días del usuario autenticado) | [reference/gettimeentrieswithinadaterange.md](https://developer.clickup.com/reference/gettimeentrieswithinadaterange.md) | Sí | Todos |
| 81 | Create a time entry | POST `/v2/team/{team_id}/time_entries` (`assignee` para otros: Business Plus+) | [reference/createatimeentry.md](https://developer.clickup.com/reference/createatimeentry.md) | Sí | Ver params por plan |
| 82 | Get singular time entry | GET `/v2/team/{team_id}/time_entries/{id}` | [reference/getsingulartimeentry.md](https://developer.clickup.com/reference/getsingulartimeentry.md) | Sí | Todos |
| 83 | Delete a time entry | DELETE `/v2/team/{team_id}/time_entries/{id}` | [reference/deleteatimeentry.md](https://developer.clickup.com/reference/deleteatimeentry.md) | Sí | Todos |
| 84 | Update a time entry | PUT `/v2/team/{team_id}/time_entries/{id}` | [reference/updateatimeentry.md](https://developer.clickup.com/reference/updateatimeentry.md) | Sí | Ver params por plan |
| 85 | Get time entry history | GET `/v2/team/{team_id}/time_entries/{id}/history` | [reference/gettimeentryhistory.md](https://developer.clickup.com/reference/gettimeentryhistory.md) | Sí | Todos |
| 86 | Get running time entry | GET `/v2/team/{team_id}/time_entries/running` (duración negativa = corriendo) | [reference/getrunningtimeentry.md](https://developer.clickup.com/reference/getrunningtimeentry.md) | Sí | Todos |
| 87 | Remove tags from time entries | DELETE `/v2/team/{team_id}/time_entries/tags` | [reference/removetagsfromtimeentries.md](https://developer.clickup.com/reference/removetagsfromtimeentries.md) | Sí | Todos |
| 88 | Get all tags from time entries | GET `/v2/team/{team_id}/time_entries/tags` | [reference/getalltagsfromtimeentries.md](https://developer.clickup.com/reference/getalltagsfromtimeentries.md) | Sí | Todos |
| 89 | Add tags to time entries | POST `/v2/team/{team_id}/time_entries/tags` | [reference/addtagsfromtimeentries.md](https://developer.clickup.com/reference/addtagsfromtimeentries.md) | Sí | Tags ilimitados: Business Plus+ |
| 90 | Change tag names (time entries) | PUT `/v2/team/{team_id}/time_entries/tags` | [reference/changetagnamesfromtimeentries.md](https://developer.clickup.com/reference/changetagnamesfromtimeentries.md) | Sí | Todos |
| 91 | Start a time entry | POST `/v2/team/{team_id}/time_entries/start` | [reference/startatimeentry.md](https://developer.clickup.com/reference/startatimeentry.md) | Sí | Ver params por plan |
| 92 | Stop a time entry | POST `/v2/team/{team_id}/time_entries/stop` | [reference/stopatimeentry.md](https://developer.clickup.com/reference/stopatimeentry.md) | Sí | Todos |

### 3.14 Time Tracking Legacy (v2) — deprecated en la práctica, aún activos

| # | Operación | Método + Ruta | Ref | PAT | Plan |
|---|---|---|---|---|---|
| 93 | Get tracked time | GET `/v2/task/{task_id}/time` `[VERIFICAR]` | [reference/gettrackedtime.md](https://developer.clickup.com/reference/gettrackedtime.md) | Sí | Todos |
| 94 | Track time | POST `/v2/task/{task_id}/time` `[VERIFICAR]` | [reference/tracktime.md](https://developer.clickup.com/reference/tracktime.md) | Sí | Todos |
| 95 | Edit time tracked | PUT `/v2/task/{task_id}/time` `[VERIFICAR]` | [reference/edittimetracked.md](https://developer.clickup.com/reference/edittimetracked.md) | Sí | Todos |
| 96 | Delete time tracked | DELETE `/v2/task/{task_id}/time` `[VERIFICAR]` | [reference/deletetimetracked.md](https://developer.clickup.com/reference/deletetimetracked.md) | Sí | Todos |

### 3.15 Templates (v2) — solo listado

| # | Operación | Método + Ruta | Ref | PAT | Plan |
|---|---|---|---|---|---|
| 97 | Get Task Templates | GET `/v2/team/{team_id}/task_template` `[VERIFICAR]` | [reference/gettasktemplates.md](https://developer.clickup.com/reference/gettasktemplates.md) | Sí | Todos |
| 98 | Get List Templates | GET `/v2/team/{team_id}/list_template` `[VERIFICAR]` | [reference/getlisttemplates.md](https://developer.clickup.com/reference/getlisttemplates.md) | Sí | Todos |
| 99 | Get Folder Templates | GET `/v2/team/{team_id}/folder_template` `[VERIFICAR]` | [reference/getfoldertemplates.md](https://developer.clickup.com/reference/getfoldertemplates.md) | Sí | Todos |

### 3.16 Views (v2) — 4 niveles de jerarquía

| # | Operación | Método + Ruta | Ref | PAT | Plan |
|---|---|---|---|---|---|
| 100 | Get Workspace Views | GET `/v2/team/{team_id}/view` | [reference/getteamviews.md](https://developer.clickup.com/reference/getteamviews.md) | Sí | Todos |
| 101 | Create Workspace View | POST `/v2/team/{team_id}/view` | [reference/createteamview.md](https://developer.clickup.com/reference/createteamview.md) | Sí | Todos |
| 102 | Get Space Views | GET `/v2/space/{space_id}/view` | [reference/getspaceviews.md](https://developer.clickup.com/reference/getspaceviews.md) | Sí | Todos |
| 103 | Create Space View | POST `/v2/space/{space_id}/view` | [reference/createspaceview.md](https://developer.clickup.com/reference/createspaceview.md) | Sí | Todos |
| 104 | Get Folder Views | GET `/v2/folder/{folder_id}/view` | [reference/getfolderviews.md](https://developer.clickup.com/reference/getfolderviews.md) | Sí | Todos |
| 105 | Create Folder View | POST `/v2/folder/{folder_id}/view` | [reference/createfolderview.md](https://developer.clickup.com/reference/createfolderview.md) | Sí | Todos |
| 106 | Get List Views | GET `/v2/list/{list_id}/view` | [reference/getlistviews.md](https://developer.clickup.com/reference/getlistviews.md) | Sí | Todos |
| 107 | Create List View | POST `/v2/list/{list_id}/view` | [reference/createlistview.md](https://developer.clickup.com/reference/createlistview.md) | Sí | Todos |
| 108 | Get View | GET `/v2/view/{view_id}` | [reference/getview.md](https://developer.clickup.com/reference/getview.md) | Sí | Todos |
| 109 | Update View | PUT `/v2/view/{view_id}` (grouping/sorting/filters/columns) | [reference/updateview.md](https://developer.clickup.com/reference/updateview.md) | Sí | Todos |
| 110 | Delete View | DELETE `/v2/view/{view_id}` | [reference/deleteview.md](https://developer.clickup.com/reference/deleteview.md) | Sí | Todos |
| 111 | Get View Tasks | GET `/v2/view/{view_id}/task` | [reference/getviewtasks.md](https://developer.clickup.com/reference/getviewtasks.md) | Sí | Todos |

### 3.12b Members, Roles, Shared Hierarchy, User Groups, Users, Guests, Webhooks (v2)

| # | Operación | Método + Ruta | Ref | PAT | Plan |
|---|---|---|---|---|---|
| 112 | Get Task Members | GET `/v2/task/{task_id}/member` | [reference/gettaskmembers.md](https://developer.clickup.com/reference/gettaskmembers.md) | Sí | Todos |
| 113 | Get List Members | GET `/v2/list/{list_id}/member` | [reference/getlistmembers.md](https://developer.clickup.com/reference/getlistmembers.md) | Sí | Todos |
| 114 | Get Custom Roles | GET `/v2/team/{team_id}/role` `[VERIFICAR]` | [reference/getcustomroles.md](https://developer.clickup.com/reference/getcustomroles.md) | Sí | Todos (custom roles: plan superior `[VERIFICAR]`) |
| 115 | Shared Hierarchy | GET `/v2/team/{team_id}/share` `[VERIFICAR]` | [reference/sharedhierarchy.md](https://developer.clickup.com/reference/sharedhierarchy.md) | Sí | Todos |
| 116 | Create Group (User Group) | POST `/v2/team/{team_id}/group` | [reference/createusergroup.md](https://developer.clickup.com/reference/createusergroup.md) | Sí | Todos |
| 117 | Update Group | PUT `/v2/group/{group_id}` | [reference/updateteam.md](https://developer.clickup.com/reference/updateteam.md) | Sí | Todos |
| 118 | Delete Group | DELETE `/v2/group/{group_id}` | [reference/deleteteam.md](https://developer.clickup.com/reference/deleteteam.md) | Sí | Todos |
| 119 | Get Groups | GET `/v2/team/{team_id}/group` | [reference/getteams1.md](https://developer.clickup.com/reference/getteams1.md) | Sí | Todos |
| 120 | Invite User To Workspace | POST `/v2/team/{team_id}/user` | [reference/inviteusertoworkspace.md](https://developer.clickup.com/reference/inviteusertoworkspace.md) | Sí | **Enterprise** |
| 121 | Get User | GET `/v2/team/{team_id}/user/{user_id}` | [reference/getuser.md](https://developer.clickup.com/reference/getuser.md) | Sí | **Enterprise** |
| 122 | Edit User On Workspace | PUT `/v2/team/{team_id}/user/{user_id}` | [reference/edituseronworkspace.md](https://developer.clickup.com/reference/edituseronworkspace.md) | Sí | **Enterprise** |
| 123 | Remove User From Workspace | DELETE `/v2/team/{team_id}/user/{user_id}` | [reference/removeuserfromworkspace.md](https://developer.clickup.com/reference/removeuserfromworkspace.md) | Sí | **Enterprise** |
| 124 | Invite Guest To Workspace | POST `/v2/team/{team_id}/guest` | [reference/inviteguesttoworkspace.md](https://developer.clickup.com/reference/inviteguesttoworkspace.md) | Sí | **Enterprise** |
| 125 | Get Guest | GET `/v2/team/{team_id}/guest/{guest_id}` | [reference/getguest.md](https://developer.clickup.com/reference/getguest.md) | Sí | **Enterprise** |
| 126 | Edit Guest On Workspace | PUT `/v2/team/{team_id}/guest/{guest_id}` | [reference/editguestonworkspace.md](https://developer.clickup.com/reference/editguestonworkspace.md) | Sí | **Enterprise** |
| 127 | Remove Guest From Workspace | DELETE `/v2/team/{team_id}/guest/{guest_id}` | [reference/removeguestfromworkspace.md](https://developer.clickup.com/reference/removeguestfromworkspace.md) | Sí | **Enterprise** |
| 128 | Add Guest To Task | PUT `/v2/task/{task_id}/guest/{guest_id}` `[VERIFICAR]` | [reference/addguesttotask.md](https://developer.clickup.com/reference/addguesttotask.md) | Sí | **Enterprise** |
| 129 | Remove Guest From Task | DELETE `/v2/task/{task_id}/guest/{guest_id}` `[VERIFICAR]` | [reference/removeguestfromtask.md](https://developer.clickup.com/reference/removeguestfromtask.md) | Sí | **Enterprise** |
| 130 | Add Guest To List | PUT `/v2/list/{list_id}/guest/{guest_id}` `[VERIFICAR]` | [reference/addguesttolist.md](https://developer.clickup.com/reference/addguesttolist.md) | Sí | **Enterprise** |
| 131 | Remove Guest From List | DELETE `/v2/list/{list_id}/guest/{guest_id}` `[VERIFICAR]` | [reference/removeguestfromlist.md](https://developer.clickup.com/reference/removeguestfromlist.md) | Sí | **Enterprise** |
| 132 | Add Guest To Folder | PUT `/v2/folder/{folder_id}/guest/{guest_id}` `[VERIFICAR]` | [reference/addguesttofolder.md](https://developer.clickup.com/reference/addguesttofolder.md) | Sí | **Enterprise** |
| 133 | Remove Guest From Folder | DELETE `/v2/folder/{folder_id}/guest/{guest_id}` `[VERIFICAR]` | [reference/removeguestfromfolder.md](https://developer.clickup.com/reference/removeguestfromfolder.md) | Sí | **Enterprise** |
| 134 | Get Webhooks | GET `/v2/team/{team_id}/webhook` (solo webhooks del usuario autenticado) | [reference/getwebhooks.md](https://developer.clickup.com/reference/getwebhooks.md) | Sí | Todos |
| 135 | Create Webhook | POST `/v2/team/{team_id}/webhook` | [reference/createwebhook.md](https://developer.clickup.com/reference/createwebhook.md) | Sí | Todos (URL en dominio público permitido) |
| 136 | Update Webhook | PUT `/v2/webhook/{webhook_id}` | [reference/updatewebhook.md](https://developer.clickup.com/reference/updatewebhook.md) | Sí | Todos |
| 137 | Delete Webhook | DELETE `/v2/webhook/{webhook_id}` | [reference/deletewebhook.md](https://developer.clickup.com/reference/deletewebhook.md) | Sí | Todos |

**Total v2: 137 operaciones.**

### 3.17 v3 — Privacy/ACL, Attachments, Audit Logs, Chat, Docs, Tasks

| # | Operación | Método + Ruta | Ref | PAT | Plan |
|---|---|---|---|---|---|
| 138 | Update privacy & access (ACL) | PATCH `/v3/workspaces/{workspace_id}/...` `[VERIFICAR ruta]` | [reference/publicpatchacl.md](https://developer.clickup.com/reference/publicpatchacl.md) | Sí | Compartir puede cobrar |
| 139 | Get Attachments (parent entity) | GET `/v3/workspaces/{workspace_id}/attachments` `[VERIFICAR]` | [reference/getparententityattachments.md](https://developer.clickup.com/reference/getparententityattachments.md) | Sí | Todos |
| 140 | Create Attachment (v3) | POST `/v3/workspaces/{workspace_id}/attachments` `[VERIFICAR]` | [reference/postentityattachment.md](https://developer.clickup.com/reference/postentityattachment.md) | Sí | Todos |
| 141 | Create Workspace audit logs | POST `/v3/workspaces/{workspace_id}/audit_logs` `[VERIFICAR]` | [reference/queryauditlog.md](https://developer.clickup.com/reference/queryauditlog.md) | Sí | **Enterprise**, solo owner |
| 142 | Retrieve Channels | GET `/v3/workspaces/{workspace_id}/chat/channels` | [reference/getchatchannels.md](https://developer.clickup.com/reference/getchatchannels.md) | Sí | Todos (API experimental) |
| 143 | Create a Channel | POST `/v3/workspaces/{workspace_id}/chat/channels` | [reference/createchatchannel.md](https://developer.clickup.com/reference/createchatchannel.md) | Sí | Todos |
| 144 | Create Channel on Space/Folder/List | POST `/v3/workspaces/{workspace_id}/chat/.../channels` `[VERIFICAR ruta location]` | [reference/createlocationchatchannel.md](https://developer.clickup.com/reference/createlocationchatchannel.md) | Sí | Todos |
| 145 | Create a Direct Message | POST `/v3/workspaces/{workspace_id}/chat/direct_message?` `[VERIFICAR]` | [reference/createdirectmessagechatchannel.md](https://developer.clickup.com/reference/createdirectmessagechatchannel.md) | Sí | Todos (≤15 usuarios) |
| 146 | Retrieve a Channel | GET `/v3/workspaces/{workspace_id}/chat/channels/{channel_id}` | [reference/getchatchannel.md](https://developer.clickup.com/reference/getchatchannel.md) | Sí | Todos |
| 147 | Update a Channel | PATCH/PUT `/v3/workspaces/{workspace_id}/chat/channels/{channel_id}` `[VERIFICAR método]` | [reference/updatechatchannel.md](https://developer.clickup.com/reference/updatechatchannel.md) | Sí | Todos |
| 148 | Delete a Channel | DELETE `/v3/workspaces/{workspace_id}/chat/channels/{channel_id}` | [reference/deletechatchannel.md](https://developer.clickup.com/reference/deletechatchannel.md) | Sí | Todos |
| 149 | Retrieve Channel followers | GET `.../chat/channels/{channel_id}/followers` | [reference/getchatchannelfollowers.md](https://developer.clickup.com/reference/getchatchannelfollowers.md) | Sí | Todos |
| 150 | Retrieve Channel members | GET `.../chat/channels/{channel_id}/members` | [reference/getchatchannelmembers.md](https://developer.clickup.com/reference/getchatchannelmembers.md) | Sí | Todos |
| 151 | Retrieve Channel messages | GET `.../chat/channels/{channel_id}/messages` | [reference/getchatmessages.md](https://developer.clickup.com/reference/getchatmessages.md) | Sí | Todos |
| 152 | Send a message | POST `.../chat/channels/{channel_id}/messages` | [reference/createchatmessage.md](https://developer.clickup.com/reference/createchatmessage.md) | Sí | Todos |
| 153 | Update a message | PATCH `.../chat/messages/{message_id}` `[VERIFICAR]` | [reference/patchchatmessage.md](https://developer.clickup.com/reference/patchchatmessage.md) | Sí | Todos |
| 154 | Delete a message | DELETE `.../chat/messages/{message_id}` `[VERIFICAR]` | [reference/deletechatmessage.md](https://developer.clickup.com/reference/deletechatmessage.md) | Sí | Todos |
| 155 | Retrieve message reactions | GET `.../chat/messages/{message_id}/reactions` `[VERIFICAR]` | [reference/getchatmessagereactions.md](https://developer.clickup.com/reference/getchatmessagereactions.md) | Sí | Todos |
| 156 | Create a message reaction | POST `.../chat/messages/{message_id}/reactions` `[VERIFICAR]` | [reference/createchatreaction.md](https://developer.clickup.com/reference/createchatreaction.md) | Sí | Todos |
| 157 | Delete a message reaction | DELETE `.../chat/messages/{message_id}/reactions/{reaction_id}` `[VERIFICAR]` | [reference/deletechatreaction.md](https://developer.clickup.com/reference/deletechatreaction.md) | Sí | Todos |
| 158 | Retrieve message replies | GET `.../chat/messages/{message_id}/replies` `[VERIFICAR]` | [reference/getchatmessagereplies.md](https://developer.clickup.com/reference/getchatmessagereplies.md) | Sí | Todos |
| 159 | Create a reply message | POST `.../chat/messages/{message_id}/replies` `[VERIFICAR]` | [reference/createreplymessage.md](https://developer.clickup.com/reference/createreplymessage.md) | Sí | Todos |
| 160 | Retrieve message tagged users | GET `.../chat/messages/{message_id}/tagged_users` `[VERIFICAR]` | [reference/getchatmessagetaggedusers.md](https://developer.clickup.com/reference/getchatmessagetaggedusers.md) | Sí | Todos |
| 161 | Get Post Subtype IDs | GET `/v3/workspaces/{workspace_id}/chat/subtypes?` `[VERIFICAR]` | [reference/getsubtypes.md](https://developer.clickup.com/reference/getsubtypes.md) | Sí | Todos |
| 162 | Search for Docs | GET `/v3/workspaces/{workspace_id}/docs` | [reference/searchdocspublic.md](https://developer.clickup.com/reference/searchdocspublic.md) | Sí | Todos |
| 163 | Create a Doc | POST `/v3/workspaces/{workspace_id}/docs` | [reference/createdocpublic.md](https://developer.clickup.com/reference/createdocpublic.md) | Sí | Todos |
| 164 | Fetch a Doc | GET `/v3/workspaces/{workspace_id}/docs/{doc_id}` | [reference/getdocpublic.md](https://developer.clickup.com/reference/getdocpublic.md) | Sí | Todos |
| 165 | Fetch PageListing for a Doc | GET `.../docs/{doc_id}/page_listing?` `[VERIFICAR]` | [reference/getdocpagelistingpublic.md](https://developer.clickup.com/reference/getdocpagelistingpublic.md) | Sí | Todos |
| 166 | Fetch Pages belonging to a Doc | GET `.../docs/{doc_id}/pages` | [reference/getdocpagespublic.md](https://developer.clickup.com/reference/getdocpagespublic.md) | Sí | Todos |
| 167 | Create a Page | POST `.../docs/{doc_id}/pages` | [reference/createpagepublic.md](https://developer.clickup.com/reference/createpagepublic.md) | Sí | Todos |
| 168 | Get page | GET `.../docs/{doc_id}/pages/{page_id}` | [reference/getpagepublic.md](https://developer.clickup.com/reference/getpagepublic.md) | Sí | Todos |
| 169 | Edit a Page | PUT/PATCH `.../docs/{doc_id}/pages/{page_id}` `[VERIFICAR método]` | [reference/editpagepublic.md](https://developer.clickup.com/reference/editpagepublic.md) | Sí | Todos |
| 170 | Move a task to a new List (v3) | POST `/v3/tasks/{task_id}/move` `[VERIFICAR]` | [reference/movetask.md](https://developer.clickup.com/reference/movetask.md) | Sí | Todos |
| 171 | Update task time estimates by user | PUT `/v3/tasks/{task_id}/...` `[VERIFICAR]` | [reference/updatetimeestimatesbyuser.md](https://developer.clickup.com/reference/updatetimeestimatesbyuser.md) | Sí | Todos |
| 172 | Replace task time estimates | PUT `/v3/tasks/{task_id}/...` `[VERIFICAR]` | [reference/replacetimeestimatesbyuser.md](https://developer.clickup.com/reference/replacetimeestimatesbyuser.md) | Sí | Todos |

**Total v3: 35 operaciones. TOTAL GLOBAL: 172 operaciones catalogadas** (el conteo exacto puede variar ±2 al consolidar rutas `[VERIFICAR]`).

### 3.18 Lo que NO existe en la API pública (2026-10-19)

| Recurso pedido | Estado en API pública | Nota |
|---|---|---|
| Whiteboards | **NO EXISTE** — cero endpoints en llms.txt v2/v3 | El embedding de whiteboards en Docs tampoco es exportable |
| Dashboards / widgets | **NO EXISTE** — no hay categoría Dashboards | Reporting solo indirecto: Views + time in status + time entries |
| Embeds (genérico) | **NO EXISTE** como recurso | Solo el elemento embed dentro de Docs/Chat, no CRUD |
| Reporting | **NO EXISTE** como recurso | Solo proxies: Get View Tasks, time entries, time in status |
| Bulk task update | **NO EXISTE** PATCH masivo de tasks | Solo "Get Bulk Tasks' Time in Status"; iterar 1×1 respetando rate limit |
| Search global de texto | **NO EXISTE** endpoint público | `GET /api/v2/task?query=` → 404 (confirmado por skill). Alternativa: Get Filtered Team Tasks + filtro client-side |
| Editar/eliminar un Doc (v3) | **NO EXISTE** a nivel doc — solo pages son CRUD completos | La skill lo confirmó: docs son create/read-only, se borran desde UI |

---

## 4. Scopes del PAT — no hay sistema de scopes

**Hallazgo crítico:** ClickUp NO implementa scopes granulares en ningún mecanismo de autenticación. La evidencia:

1. La OpenAPI definition de v2 declara **un único `securitySchemes.Authorization_Token` de tipo `apiKey` (header)** con dos variantes de valor (`pk_...` o `Bearer ...`) y `security: [{"Authorization_Token": []}]` global — sin `flows`, sin `scopes`.
2. La página de Authentication describe PAT y OAuth como "methods", nunca como "permissions" o "scopes". El único control documentado de permisos OAuth es **qué Workspaces el usuario autoriza** durante el flujo (no qué endpoints).
3. El token actúa siempre como el usuario: "Both methods ensure that you and your users only have access to the information permitted by ClickUp" — es decir, los permisos del propio usuario.

**Consecuencia para el tool:** el límite real de acción del PAT de Andrés es (a) su rol de usuario en el workspace (owner/admin/member/guest), (b) el plan del workspace (Enterprise vs Free...), y (c) qué hierarquía le fue compartida.

### Tabla "scope de facto" (PAT de un usuario normal, workspace Free/Unlimited/Business)

| Capacidad | ¿Accesible con PAT? | Gate real | Endpoints |
|---|---|---|---|
| CRUD básico de tasks (crear/leer/actualizar/completar/borrar) | ✅ Sí | ninguno (además del acceso del usuario a la lista) | 29–34, 39–44, 45–48, 70–71 |
| Administración completa del workspace | ⚠️ Parcial | Owner/admin para crear Spaces/webhooks; gestión de users/guests **solo Enterprise** | 6–17, 18–28, 120–133 |
| Time tracking | ✅ Sí | params `assignee`/`tags`/`tid` ilimitados solo Business Plus+ | 80–96 |
| Goals y reporting | ✅ Sí (goals) / ⚠️ reporting solo por proxies | ninguno | 72–79, 100–111 |
| Webhooks | ✅ Sí | URL pública allowlisted; webhook ligado al usuario | 134–137 |
| Chat | ✅ Sí | API experimental | 142–161 |
| Docs | ✅ Sí | sin delete/update a nivel doc | 162–169 |
| Custom fields | ✅ Sí (set) | **Free: 60 usos acumulados** de Set Custom Field Value; uso ilimitado en planes pagos | 59–64 |
| Adjuntos | ✅ Sí | 1 GB máx por archivo; almacenamiento de la cuenta (GBUSED_005) | 139–140 (+ upload v2 en §3.5 nota) |

### ¿Qué NO es accesible con PAT (vs OAuth)?

| Capacidad | PAT | OAuth | Nota |
|---|---|---|---|
| Construir apps para terceros (multi-usuario) | ❌ No | ✅ Sí | PAT es personal; OAuth permite a cada usuario autorizar su(s) workspace(s) |
| Flujo de instalación de app (authorization code) | ❌ No existe para PAT | ✅ `app.clickup.com/api?client_id=...` | PAT no pasa por el flow |
| Actuar en nombre de otro usuario | ❌ No | ❌ No — OAuth tampoco permite impersonation; cada token actúa como su usuario | La respuesta webhook lleva `history_items[].user.id` para saber quién hizo qué |
| Scopes granulares (ej. "solo read") | ❌ No existe | ❌ No existe | **[VERIFICAR en soporte si han añadido scopes OAuth en 2025-2026 — no hay evidencia en docs] |
| Nota de compatibilidad | `Authorization: pk_...` (SIN Bearer) | `Authorization: Bearer ...` (CON Bearer) | El header con Bearer + pk_ **falla** (quirk confirmado por la skill) |

---

## 5. Rate limits, paginación y uploads

### Rate limits (por token)

| Plan del workspace | Límite | Fuente |
|---|---|---|
| Free Forever / Unlimited / Business | **100 requests/min** | docs/rate-limits.md |
| Business Plus | **1,000 requests/min** | docs/rate-limits.md |
| Enterprise | **10,000 requests/min** | docs/rate-limits.md |

- El límite es **por token**, no por IP ni por workspace ("vary by Workspace Plan of the Workspace hosting the token").
- La skill midió ~100/min **compartido entre dispositivos que usen la misma key** (429 `APP_002`, `Retry-After: 60`).
- Headers (visibles en el 429, y normalmente en cada respuesta): `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (unix timestamp).
- Estrategia recomendada para el tool: budget client-side (leaky bucket a ~90 req/min), sleep con `Retry-After`, backoff exponencial solo para 5xx.

### Paginación

| Recurso | Modelo | Límite por página | Fuente |
|---|---|---|---|
| Get Tasks / Get Filtered Team Tasks | offset por página (`page` param) `[VERIFICAR nombre exacto del param]` | **100 tasks/página** | reference/gettasks.md |
| Task Comments | cursor implícito `start` + `start_id` | **25 comentarios/página** (default) | reference/gettaskcomments.md |
| Chat messages | paginación `[VERIFICAR params]` | `[VERIFICAR]` | reference/getchatmessages.md |
| Docs search | paginación `[VERIFICAR]` | `[VERIFICAR]` | reference/searchdocspublic.md |
| Time entries | rango de fechas como filtro | sin límite documentado `[VERIFICAR]` | reference/gettimeentrieswithinadaterange.md |

- No existe documentación de paginación global — cada endpoint define la suya `[VERIFICAR por-endpoint al implementar]`.

### Límites de body / uploads

| Límite | Valor | Fuente |
|---|---|---|
| Adjuntos | **1 GB máx por archivo**, cualquier tipo de archivo, `multipart/form-data`, campo `attachment[]` | docs/attachments.md |
| Storage de cuenta | al agotarse → `4xx GBUSED_005` | docs/attachments.md |
| Body size general | **No documentado** `[VERIFICAR]` | — |
| Timeout de request | timeouts reportados con responses grandes (docs/tasks.md recomienda v3 para eso) | docs/tasks.md |

---

## 6. PAT vs OAuth — resumen de diferencias

| Dimensión | PAT (`pk_...`) | OAuth 2.0 (Bearer) |
|---|---|---|
| Header exacto | `Authorization: pk_...` (SIN Bearer) | `Authorization: Bearer ...` |
| Expiración | **Nunca expira** (oficial) | No expira actualmente ("subject to change") |
| Emitido por | Settings → Apps → API Token (cualquier usuario) | OAuth app (owner/admin crea client) |
| Quién actúa | El usuario dueño del token | El usuario que autorizó |
| Alcance | Todo lo que el usuario puede hacer | Igual — no hay scopes; solo selección de Workspaces al autorizar |
| Multi-workspace | Sí, todos los workspaces donde el usuario es miembro | Solo los workspaces autorizados en el flow |
| Caso de uso | Scripts personales, agentes, try-it de docs | Apps para terceros |
| Endpoint `POST /v2/oauth/token` | No aplica | Sí |

**Conclusión operativa:** para el tool de Andrés, PAT es suficiente y más simple. OAuth solo añadiría valor si el tool se distribuye a otros usuarios.

---

## 7. Patrones y peculiaridades (data model + comportamiento)

### Tareas
- **Prioridades:** `1=Urgent, 2=High, 3=Normal, 4=Low`. No son customizables. **No existe nivel 5.** (docs/tasks.md).
- **Subtareas:** se crean con `parent` en Create Task; anidadas (nietas) permitidas — el `parent` apunta al padre inmediato. Para verlas: `subtasks=true` en Get Task(s)/Get Filtered Team Tasks. Profundidad máxima no documentada `[VERIFICAR]`.
- **Dependencies:** `POST /task/{id}/dependency` con `wait_for` (la tarea espera a otra) o `depend_on`. GET Task devuelve `dependencies[]` con `type: 1` y `chain_id`.
- **Linked tasks:** campo `links_to` / endpoints `/link`; solo task↔task.
- **`due_date` vs `due_date_time`:** `due_date` es timestamp (ms); `due_date_time` es un **boolean** que indica si la fecha lleva componente de hora. Igual para `start_date`/`start_date_time`. (convención v2, docs/tasks.md "options for including or excluding time components").
- **Recurrencia:** **no hay parámetros de recurrence en Create/Update Task públicos** `[VERIFICAR: es posible que las tareas recurrentes solo se gestionen desde la UI]`.
- **Time estimates:** en **milisegundos**; v3 permite setear por usuario (`assignee: unassigned` incluido).
- **Custom fields al crear:** solo se guardan si el field es aplicable al `custom_item_id` (task type); para actualizar una task existente hay que usar Set Custom Field Value (Update Task NO soporta CF).
- **`markdown_description`:** soporta headers, emphasis, listas, imágenes/links, blockquotes, inline code. La skill recomienda `description` plano para que los GET conserven los `##` (quirk de flattening).
- **Escapado:** dobles comillas en `text_content`/`description`/`markdown_description` → `\"`.
- **Mover task de lista:** solo v3 (`Move a task to a new List`); en v2 la única vía es add/remove task to list (requiere ClickApp Tasks in Multiple Lists).

### Custom fields (tipos soportados por la API)
`url`, `drop_down`, `labels`, `email`, `phone`, `date`, `short_text`, `text`, `checkbox`, `number`, `currency`, `tasks`, `users`, `emoji` (rating), `automatic_progress`, `manual_progress`, `location`. **Voting no se puede setear por API** (solo se devuelve). Filtros con `field_id`+`operator`+`value` en Get Filtered Team Tasks (operadores ANY/rango).
Formatos de `value` por tipo: dropdown→string/uuid de option; date→`{value, value_options:{time:bool}}` `[VERIFICAR formato exacto]`; tasks/users→`{add:[], rem:[]}`; labels→array de ids (sobrescribe); emoji→int ≤ count; manual_progress→`{current}`; location→`{location:{lat,lng}, formatted_address}`; resto: string/bool/number.

### Webhooks
- Registro con PAT; **el webhook queda ligado al usuario**: si el usuario se desactiva, el webhook sigue existiendo pero deja de dispararse.
- Secret devuelto al crear (`webhook.secret`); cada delivery lleva header **`X-Signature` = HMAC-SHA256(raw body, secret) en hex**.
- Verificar con el body crudo (sin re-serializar).
- `*` = wildcard de todos los eventos. Location filters: una ubicación por nivel de jerarquía; aplica la más específica.
- Idempotency key sugerida: `{{webhook_id}}:{{history_item_id}}`.
- **Eventos:** `taskCreated`, `taskUpdated`, `taskDeleted`, `taskPriorityUpdated`, `taskStatusUpdated`, `taskAssigneeUpdated`, `taskDueDateUpdated`, `taskTagUpdated`, `taskMoved`, `taskCommentPosted`, `taskCommentUpdated`, `taskTimeEstimateUpdated`, `taskTimeTrackedUpdated`, `listCreated/Updated/Deleted`, `folderCreated/Updated/Deleted`, `spaceCreated/Updated/Deleted`, `goalCreated/Updated/Deleted`, `keyResultCreated/Updated/Deleted`.
- Payloads: `history_items[]` con `before`/`after`, `user.id` es **integer**, booleans unset pueden ser `NULL`, valores de CF no normalizados.
- Quirk de la skill: la URL del endpoint debe estar en un **dominio público allowlisted** (los quick tunnels de trycloudflare son rechazados con `OAUTH_194`).

### Otras peculiaridades
- `team_id` = workspace (legado). `group_id` = user group. `team` ≠ grupo en la docs nuevas.
- Roles: `1=owner, 2=admin, 3=member, 4=guest`.
- `order_index` ya no ordena tasks/subtasks (solo spaces/folders/lists/statuses) — sigue llegando por compatibilidad.
- Notificaciones: toda acción por API dispara las mismas notificaciones que la UI (diseñar el tool para no spamear).
- Timestamps: **milisegundos** desde epoch.
- La skill documenta que NO hay respuestas 409 en esta API.

---

## 8. Estado de la skill `use-clickup` (~/​.pi/agent/skills/use-clickup)

### Lo que ya cubre (scripts + references)
Scripts activos: `create_task.py`, `update_task.py`, `search_task.py` (incl. búsqueda workspace con `GET /team/{id}/task`), `create_list.py`, `view_lists.py`, `client.py` (routing v2/v3 + caché con TTLs).

References que documentan además: comments, checklists, tags, custom fields, webhooks, chat (v3), docs (v3), user, límites del Free tier, formato de fechas, error handling.

**Cobertura de endpoints ≈ 40/172 (23%).** Cubiertos: Workspaces (leer), Spaces (leer), Folders (crear/listar), Lists (crear/listar), Tasks (CRUD + búsqueda + estados cerrados), Comments (referencia), Checklists (referencia), Tags (referencia), Custom Fields (referencia), Webhooks (referencia + verificado), Chat (referencia v3), Docs (referencia v3).

### Gaps (recursos/endpoints que el tool nuevo debería cubrir)

| Gap | Endpoints faltantes | Prioridad |
|---|---|---|
| **Time Tracking completo** | 13 (+4 legacy) — ni siquiera está en references | ALTA (13 endpoints, uso diario) |
| **Goals + Key Results** | 8 — no hay references | ALTA |
| **Views** | 12 — no hay references | MEDIA |
| **Task relationships** | dependencies + links (4) — no hay references | ALTA (casos de uso frecuentes) |
| **Adjuntos** | upload v2 + get/create v3 — no references | MEDIA |
| **Templates** | listado (3) + create-from-template (3) | MEDIA |
| **Delete de recursos** | delete task/list/folder/space — los scripts solo crean/actualizan | MEDIA |
| **Guests / Users admin** | 13 endpoints (Enterprise-only) | BAJA (plan gate) |
| **User Groups** | 4 | MEDIA |
| **Custom Roles / Custom Task Types / Shared Hierarchy / Members** | 5 | BAJA |
| **v3 tasks** | Move task, estimates by user (3) | MEDIA |
| **v3 extras** | Audit logs, ACL privacy (2) | BAJA |
| **Workspace meta** | seats, plan (2) | BAJA (útil para detectar plan y activar features) |
| **Merge tasks** | 1 | BAJA |
| **Time in status** | 2 (requiere ClickApp) | BAJA |
| **Search global** | no existe en API — la skill ya implementa workaround client-side | n/a |
| **Paginación de comments** | start/start_id no expuesto en scripts | MEDIA |
| **Chat v3 completo** | la skill solo cubre channels/messages/replies básicos; faltan reactions, DMs, followers, subtypes | BAJA-MEDIA |
| **Docs pages CRUD** | la skill cubre create/read; falta edit page, page listing | MEDIA |

### Bugs/workarounds ya documentados por la skill (reutilizar en el tool)
1. `Authorization: Bearer` + PAT **falla** → enviar token crudo.
2. 401 `OAUTH_027/192` = id de recurso inexistente, NO key inválida.
3. `PUT /task/{id}` con `tags` = no-op → usar `POST/DELETE /task/{id}/tag/{name}` (que además auto-crea el tag del space).
4. `order_by=closed` → 500 `ITEMV2_003`; `limit`/`query` ignorados silenciosamente → ordenar client-side.
5. Statuses de lista: la única vía es `PUT /list/{id}` con `override_statuses:true` + array completo.
6. Custom fields en Free: bloqueado/limitado (FIELD_605; docs dicen 60 usos acumulados).
7. `statuses[]=Complete` devuelve cerradas sin `include_closed`.
8. Rate limit 100/min **por key compartida** entre dispositivos; client ya duerme `Retry-After`.
9. Webhooks: URL debe ser dominio público allowlisted (no quick tunnels).
10. Descriptions: mandar `description` plano para conservar markdown en GET.
11. No hay 409 en esta API.
12. Docs: create/read-only a nivel doc; pages sí son CRUD.

---

## 9. Riesgos y unknowns (preguntas abiertas)

1. **URLs exactas de OpenAPI specs** (v2/v3) — la página existe pero no se extrajo el href. Acción: abrir docs/open-api-spec.md y copiar los links para Postman/codegen. `[VERIFICAR]`
2. **Scopes OAuth 2025-2026** — no hay evidencia de scopes granulares; confirmar con soporte si el plan es añadirlos (afectaría el diseño del tool). `[VERIFICAR]`
3. **Rutas exactas de ~25 endpoints marcados `[VERIFICAR]`** — todos tienen operationId confirmado en llms.txt; basta con fetch `developer.clickup.com/reference/<operationId>.md` para sellar la ruta y el schema. `[VERIFICAR]`
4. **Recurrencia de tasks por API** — sin parámetros públicos detectados. `[VERIFICAR]`
5. **Profundidad máxima de subtasks** — nested documentado, límite no. `[VERIFICAR]`
6. **Paginación de Chat/Docs/time entries** — parámetros no documentados en los extractos. `[VERIFICAR]`
7. **API v2/v3 changelog** — no hay changelog público; los cambios recientes (12 meses) se infieren de endpoints nuevos en llms.txt. Preguntar a soporte si hay RSS/release notes. `[VERIFICAR]`
8. **Estado del MCP server oficial** — existe (docs + setup + lista de tools) pero no se auditaron sus tools; podría solapar con el tool custom. `[VERIFICAR cobertura de docs/mcp-tools.md]`
9. **Plan real del workspace de Andrés** — determina rate limit (100 vs 1000 vs 10000) y si guests/users admin están disponibles. Verificar con `GET /v2/workspaces/{workspace_id}/plan` + `GET /v2/user`.
10. **Comportamiento de `page` param en Get Tasks** — nombre/semántica del parámetro de paginación no confirmado en extracto. `[VERIFICAR]`
11. **Límite de body size** (no adjuntos) — no documentado. `[VERIFICAR]`
12. **Chat v3 "experimental"** — riesgo de breaking changes sin aviso; enmascarar con version pinning del client y tests de humo.

---

## 10. Top 15 endpoints críticos (orden de implementación sugerido)

| # | Endpoint | Por qué primero |
|---|---|---|
| 1 | `GET /v2/team` + `GET /v2/user` | Punto de entrada: workspace_id y usuario; detecta plan |
| 2 | `GET /v2/team/{team_id}/task` | Búsqueda workspace-wide (la skill ya la usa) |
| 3 | `POST /v2/list/{list_id}/task` | Crear tareas — operación más frecuente |
| 4 | `PUT /v2/task/{task_id}` | Update de tasks (status, prioridad, fechas) |
| 5 | `GET /v2/list/{list_id}/task` | Listar tareas de una lista (100/page) |
| 6 | `GET /v2/task/{task_id}` | Detalle completo (subtasks, dependencies, CF, attachments) |
| 7 | `POST /v2/task/{task_id}/comment` | Comentar (automatizaciones, reportes) |
| 8 | `GET /v2/team/{team_id}/time_entries` + `POST /v2/team/{team_id}/time_entries/start|stop` | Timer programático — gap mayor de la skill |
| 9 | `POST /v2/team/{team_id}/goal` (+ key results) | Goals — gap completo de la skill |
| 10 | `POST /v2/space/{space_id}/list` / `POST /v2/folder/{folder_id}/list` | Crear listas (la skill ya tiene una vía; consolidar) |
| 11 | `POST /v2/team/{team_id}/webhook` (+ X-Signature verify) | Webhooks: reactividad en tiempo real |
| 12 | `POST /v2/task/{task_id}/field/{field_id}` | Set Custom Field Value (con plan-gate Free 60 usos) |
| 13 | `POST /v2/task/{task_id}/dependency` | Dependencies — sin esto el tool no modela bloqueos |
| 14 | `POST /v2/list/{list_id}/task/{task_id}` (add to list) + v3 `Move a task to a new List` | Reubicación de tareas |
| 15 | `POST /v3/workspaces/{workspace_id}/docs` + `POST .../pages` + `PUT .../pages/{page_id}` | Docs como canal de reportes (con limitaciones de formato §3.17/FAQ) |

---

## Apéndice A — Cómo verificar cualquier endpoint

1. Índice maestro: `https://developer.clickup.com/llms.txt` (todas las páginas .md).
2. Página de un endpoint concreto: `https://developer.clickup.com/reference/<operationId>.md` — incluye la OpenAPI definition embebida (schemas exactos de request/response).
3. Specs OpenAPI para Postman: `https://developer.clickup.com/docs/open-api-spec.md`.
4. Try-It online con PAT: `https://developer.clickup.com/docs/trytheapi.md`.

## Apéndice B — Conteo final

| Versión | Endpoints |
|---|---|
| v2 | 137 |
| v3 | 35 |
| **Total** | **172** |
| Recursos sin API (Whiteboards, Dashboards, Embeds, Reporting, bulk-update, search global) | 6 categorías ausentes |
