/**
 * clickup_webhooks — CRUD for webhooks. Webhooks are bound to the user; if the user
 * is deactivated, the webhook stops firing.
 * v2 endpoints 134-137.
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum, IdParam, safeExecute, okResult, errResult, makeClient } from "./shared.js";
import { resolveCredentials } from "../config.js";

const WebhookEvents = Type.Array(
	Type.String({
		description:
			"Event name: taskCreated, taskUpdated, taskDeleted, taskStatusUpdated, taskAssigneeUpdated, taskCommentPosted, listCreated, folderCreated, spaceCreated, goalCreated, keyResultCreated, etc.",
	}),
);

const WebhooksParams = Type.Object({
	action: StringEnum(["list_by_team", "create", "update", "delete"] as const),
	team_id: Type.Optional(IdParam("Workspace id (defaults to config)")),
	webhook_id: Type.Optional(IdParam("Webhook id (for update/delete)")),
	endpoint: Type.Optional(Type.String({ description: "Public URL — MUST be allowlisted by ClickUp (no quick tunnels)" })),
	events: WebhookEvents,
	space_id: Type.Optional(IdParam("Optional location filter" )),
	folder_id: Type.Optional(IdParam("Optional location filter" )),
	list_id: Type.Optional(IdParam("Optional location filter" )),
	status: Type.Optional(Type.String({ description: "active | paused" })),
});

export function registerWebhooksTool(pi: ExtensionAPI) {
	pi.registerTool({
		name: "clickup_webhooks",
		label: "ClickUp Webhooks",
		description: "Webhook CRUD. URL must be a public allowlisted domain. Webhook secret is returned on create; deliveries carry X-Signature = HMAC-SHA256(body, secret).",
		parameters: WebhooksParams,

		async execute(_id, params) {
			const creds = await resolveCredentials();
			if (!creds.pat) return errResult({ error: true, code: "AUTH_MISSING", http_status: 0, message: "No ClickUp PAT configured", action_hint: "Run /clickup auth." });
			const team = params.team_id || creds.team_id;
			if (!team) return errResult({ error: true, code: "MISSING_PARAM", http_status: 0, message: "team_id required", action_hint: "Set default_team_id in /clickup config or pass team_id." });
			const result = await safeExecute(async () => {
				const client = await makeClient(creds.pat);
				switch (params.action) {
					case "list_by_team":
						return client.v2("GET", `/team/${team}/webhook`);
					case "create": {
						if (!params.endpoint || !params.events?.length) throw new Error("endpoint and events required");
						const body: any = { endpoint: params.endpoint, events: params.events };
						if (params.space_id) body.space_id = Number(params.space_id);
						if (params.folder_id) body.folder_id = Number(params.folder_id);
						if (params.list_id) body.list_id = Number(params.list_id);
						return client.v2("POST", `/team/${team}/webhook`, body);
					}
					case "update": {
						if (!params.webhook_id) throw new Error("webhook_id required");
						const body: any = {};
						if (params.endpoint) body.endpoint = params.endpoint;
						if (params.events?.length) body.events = params.events;
						if (params.status) body.status = params.status;
						return client.v2("PUT", `/webhook/${params.webhook_id}`, body);
					}
					case "delete":
						if (!params.webhook_id) throw new Error("webhook_id required");
						return client.v2("DELETE", `/webhook/${params.webhook_id}`);
				}
			});
			return result.ok ? okResult(result.data) : errResult(result.error);
		},
	});
}
