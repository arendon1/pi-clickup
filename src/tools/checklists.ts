/**
 * clickup_checklists — checklists and checklist items on tasks.
 * v2 endpoints 39-44.
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum, IdParam, safeExecute, okResult, errResult, makeClient } from "./shared.js";
import { resolveCredentials } from "../config.js";

const ChecklistsParams = Type.Object({
	action: StringEnum(["create", "update", "delete", "add_item", "update_item", "delete_item"] as const),
	task_id: Type.Optional(IdParam("Task id (for create)")),
	checklist_id: Type.Optional(IdParam("Checklist id (for update/delete/add_item)")),
	checklist_item_id: Type.Optional(IdParam("Checklist item id (for update_item/delete_item)")),
	name: Type.Optional(Type.String({ description: "Checklist or item name" })),
	resolved: Type.Optional(Type.Boolean({ description: "Mark item resolved (update_item)" })),
	parent: Type.Optional(IdParam("Parent checklist_item id (for nested items)")),
	orderindex: Type.Optional(Type.Number()),
	assignee: Type.Optional(Type.Number({ description: "Assign to user id (item)")),
});

export function registerChecklistsTool(pi: ExtensionAPI) {
	pi.registerTool({
		name: "clickup_checklists",
		label: "ClickUp Checklists",
		description: "Checklists and items on tasks. Actions: create, update, delete (checklist); add_item, update_item, delete_item.",
		parameters: ChecklistsParams,

		async execute(_id, params) {
			const creds = await resolveCredentials();
			if (!creds.pat) return errResult({ error: true, code: "AUTH_MISSING", http_status: 0, message: "No ClickUp PAT configured", action_hint: "Run /clickup auth." });
			const result = await safeExecute(async () => {
				const client = await makeClient(creds.pat);
				switch (params.action) {
					case "create":
						if (!params.task_id || !params.name) throw new Error("task_id and name required");
						return client.v2("POST", `/task/${params.task_id}/checklist`, { name: params.name });
					case "update":
						if (!params.checklist_id) throw new Error("checklist_id required");
						return client.v2("PUT", `/checklist/${params.checklist_id}`, { name: params.name });
					case "delete":
						if (!params.checklist_id) throw new Error("checklist_id required");
						return client.v2("DELETE", `/checklist/${params.checklist_id}`);
					case "add_item": {
						if (!params.checklist_id || !params.name) throw new Error("checklist_id and name required");
						const body: any = { name: params.name };
						if (params.assignee) body.assignee = params.assignee;
						return client.v2("POST", `/checklist/${params.checklist_id}/checklist_item`, body);
					}
					case "update_item": {
						if (!params.checklist_item_id) throw new Error("checklist_item_id required");
						const body: any = {};
						if (params.name) body.name = params.name;
						if (typeof params.resolved === "boolean") body.resolved = params.resolved;
						if (params.assignee) body.assignee = params.assignee;
						return client.v2("PUT", `/checklist_item/${params.checklist_item_id}`, body);
					}
					case "delete_item":
						if (!params.checklist_item_id) throw new Error("checklist_item_id required");
						return client.v2("DELETE", `/checklist_item/${params.checklist_item_id}`);
				}
			});
			return result.ok ? okResult(result.data) : errResult(result.error);
		},
	});
}
