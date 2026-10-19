/**
 * clickup_lists — CRUD for lists (foldered + folderless) + status override.
 * v2 endpoints 18-28.
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum, IdParam, safeExecute, okResult, errResult, makeClient } from "./shared.js";
import { resolveCredentials } from "../config.js";

const ListStatus = Type.Object({
	status: Type.String(),
	orderindex: Type.Optional(Type.Number()),
	color: Type.Optional(Type.String()),
	type: Type.Optional(Type.String()),
});

const ListsParams = Type.Object({
	action: StringEnum(["get", "list_by_folder", "list_by_space", "create", "update", "delete", "override_statuses"] as const),
	list_id: Type.Optional(IdParam("List id (for get/update/delete)")),
	folder_id: Type.Optional(IdParam("Folder id (for list_by_folder/create)")),
	space_id: Type.Optional(IdParam("Space id (for list_by_space)")),
	name: Type.Optional(Type.String({ description: "List name" })),
	assignee: Type.Optional(Type.Union([Type.Number(), Type.Null()], { description: "Default assignee user id, or null to unassign" })),
	priority: Type.Optional(Type.Number({ description: "1=Urgent, 2=High, 3=Normal, 4=Low" })),
	status: Type.Optional(Type.String({ description: "Default status string" })),
	due_date: Type.Optional(Type.Number({ description: "Due date (ms epoch)" })),
	due_date_time: Type.Optional(Type.Boolean()),
	// override_statuses: must pass override_statuses:true and the full statuses array
	override_statuses: Type.Optional(Type.Array(ListStatus)),
});

export function registerListsTool(pi: ExtensionAPI) {
	pi.registerTool({
		name: "clickup_lists",
		label: "ClickUp Lists",
		description:
			"Lists inside folders or folderless in spaces. Actions: get, list_by_folder, list_by_space, create, update, delete, override_statuses (use override_statuses:true + full array).",
		parameters: ListsParams,

		async execute(_id, params) {
			const creds = await resolveCredentials();
			if (!creds.pat) return errResult({ error: true, code: "AUTH_MISSING", http_status: 0, message: "No ClickUp PAT configured", action_hint: "Run /clickup auth." });
			const result = await safeExecute(async () => {
				const client = await makeClient(creds.pat);
				switch (params.action) {
					case "get":
						if (!params.list_id) throw new Error("list_id required");
						return client.v2("GET", `/list/${params.list_id}`);
					case "list_by_folder":
						if (!params.folder_id) throw new Error("folder_id required");
						return client.v2("GET", `/folder/${params.folder_id}/list`);
					case "list_by_space":
						if (!params.space_id) throw new Error("space_id required");
						return client.v2("GET", `/space/${params.space_id}/list`);
					case "create": {
						if (!params.name) throw new Error("name required");
						const body: any = { name: params.name };
						if (typeof params.assignee !== "undefined") body.assignee = params.assignee;
						if (params.priority) body.priority = params.priority;
						if (params.status) body.status = params.status;
						if (params.due_date) {
							body.due_date = params.due_date;
							if (typeof params.due_date_time === "boolean") body.due_date_time = params.due_date_time;
						}
						if (params.override_statuses) {
							body.override_statuses = true;
							body.statuses = params.override_statuses;
						}
						if (params.folder_id) return client.v2("POST", `/folder/${params.folder_id}/list`, body);
						if (params.space_id) return client.v2("POST", `/space/${params.space_id}/list`, body);
						throw new Error("folder_id or space_id required for create");
					}
					case "update": {
						if (!params.list_id) throw new Error("list_id required");
						const body: any = {};
						if (params.name) body.name = params.name;
						if (typeof params.assignee !== "undefined") body.assignee = params.assignee;
						if (params.priority) body.priority = params.priority;
						if (params.status) body.status = params.status;
						if (params.due_date) {
							body.due_date = params.due_date;
							if (typeof params.due_date_time === "boolean") body.due_date_time = params.due_date_time;
						}
						if (params.override_statuses) {
							body.override_statuses = true;
							body.statuses = params.override_statuses;
						}
						return client.v2("PUT", `/list/${params.list_id}`, body);
					}
					case "delete":
						if (!params.list_id) throw new Error("list_id required");
						return client.v2("DELETE", `/list/${params.list_id}`);
					case "override_statuses":
						if (!params.list_id || !params.override_statuses)
							throw new Error("list_id and override_statuses required");
						return client.v2("PUT", `/list/${params.list_id}`, {
							override_statuses: true,
							statuses: params.override_statuses,
						});
				}
			});
			return result.ok ? okResult(result.data) : errResult(result.error);
		},
	});
}
