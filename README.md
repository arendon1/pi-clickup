# pi-clickup

Full-surface ClickUp API as native pi tools (v2 + v3).

## Install

```bash
pi install git:github.com/arendon1/pi-clickup@v0.1.0
```

Or, for local development:

```bash
pi install /Users/andres.rendon/Documents/Projects/pi-clickup
```

## Configure

In pi TUI:

| Command | What it does |
|---|---|
| `/clickup auth`   | Paste your PAT (from 1Password), validate, pick default workspace |
| `/clickup config` | View/edit settings (PAT, workspace, timeouts, rate margin) |
| `/clickup status` | Whoami, rate limit, plan tier, scopes (de-facto) |

Or set env vars (override config file):

```bash
export CLICKUP_API_KEY=pk_...
export CLICKUP_TEAM=9012345
```

The config file lives at `~/.config/clickup-pi/config.json` (chmod 600).

## Tools (22)

| Tool | Domain | v2/v3 |
|---|---|---|
| `clickup_tasks` | Tasks CRUD + search + dependencies + tags + status | v2 |
| `clickup_lists` | Lists CRUD + status override | v2 |
| `clickup_folders` | Folders CRUD | v2 |
| `clickup_spaces` | Spaces CRUD | v2 |
| `clickup_comments` | Comments (task + list) | v2 |
| `clickup_checklists` | Checklists + items | v2 |
| `clickup_tags` | Space tags + add/remove on tasks | v2 |
| `clickup_time` | Time tracking (13 endpoints) + legacy (4) | v2 |
| `clickup_goals` | Goals + key results (8) | v2 |
| `clickup_views` | Views (12) | v2 |
| `clickup_webhooks` | Webhooks CRUD (4) | v2 |
| `clickup_relationships` | Dependencies + links (4) | v2 |
| `clickup_templates` | Templates (3) | v2 |
| `clickup_attachments` | Attachments (3-4) | v2/v3 |
| `clickup_groups` | User groups (4) | v2 |
| `clickup_audit` | Plan + seats + audit logs (3) | v2/v3 |
| `clickup_docs` | Docs + pages CRUD | v3 |
| `clickup_chat` | Chat channels + messages + reactions | v3 |
| `clickup_users` | Whoami + members + roles + hierarchy + guests | v2 |
| `clickup_config` | Status from LLM (no CRUD) | local |

Each tool takes an `action` enum and the action-specific params.

## Quirks baked in

- Header is `Authorization: pk_...` (RAW, no `Bearer`).
- Rate limit: 100 req/min by token, shared across devices. Default margin 0.95.
- ClickUp has **no scope system** — the PAT acts as you, with all your permissions.
- Plan tier is detected at runtime: Free→100/min, Business Plus→1000/min, Enterprise→10000/min.
- Webhooks require the URL to be in a public allowlisted domain (no quick tunnels).
- Chat v3 is marked "experimental" — design tolerates breaking changes.

## License

MIT.
