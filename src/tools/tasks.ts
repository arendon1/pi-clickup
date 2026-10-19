/**
 * clickup_tasks — CRUD + search + dependencies + tags + status.
 * v2 endpoints 29-38. The biggest domain.
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum, IdParam, safeExecute, okResult, errResult, makeClient } from "./shared.js";
import { resolveCredentials } from "../config.js";

const TaskCustomField = Type.Object({
	id: IdParam("Custom field id"),
	value: Type.Any({ description: "Value, type depends on the field definition" }),
});

const TasksParams = Type.Object({
	action: StringEnum([
		"get",
		"list_by_list",
		"list_by_team",
		"create",
		"update",
		"delete",
		"set_status",
		"add_tag",
		"remove_tag",
		"merge",
	] as const),
	list_id: Type.Optional(IdParam("List id (for list_by_list/create)")),
	team_id: Type.Optional(IdParam("Workspace id (for list_by_team)")),
	task_id: Type.Optional(IdParam("Task id (for get/update/delete/set_status/add_tag/remove_tag/merge)")),
	task_ids: Type.Optional(Type.Array(IdParam("Task ids (for merge)"))),
	name: Type.Optional(Type.String({ description: "Task name (create/update)" })),
	description: Type.Optional(Type.String({ description: "Plain description (preserves markdown in GET — use description, not markdown_description)" })),
	markdown_description: Type.Optional(Type.String({ description: "Markdown description (rendered but not preserved on GET)" })),
	assignees_add: Type.Optional(Type.Array(Type.Number(), { description: "User ids to add as assignees" })),
	assignees_rem: Type.Optional(Type.Array(Type.Number(), { description: "User ids to remove as assignees" })),
	status: Type.Optional(Type.String({ description: "Status name" })),
	priority: Type.Optional(Type.Number({ description: "1=Urgent, 2=High, 3=Normal, 4=Low" })),
	due_date: Type.Optional(Type.Number({ description: "Due date (ms epoch)" })),
	due_date_time: Type.Optional(Type.Boolean()),
	start_date: Type.Optional(Type.Number({ description: "Start date (ms epoch)" })),
	start_date_time: Type.Optional(Type.Boolean()),
	parent: Type.Optional(Type.String({ description: "Parent task id (for subtask creation)" })),
	time_estimate: Type.Optional(Type.Number({ description: "Time estimate in ms" })),
	custom_fields: Type.Optional(Type.Array(TaskCustomField, { description: "Custom field values to set (use clickup_custom_fields to discover ids)" })),
	tag_name: Type.Optional(Type.String({ description: "Tag name (for add_tag/remove_tag)" })),
	// list filters
	include_closed: Type.Optional(Type.Boolean()),
	subtasks: Type.Optional(Type.Boolean()),
	page: Type.Optional(Type.Number()),
	order_by: Type.Optional(Type.String({ description: "e.g. 'due_date', 'priority', 'created'" })),
});

export function registerTasksTool(pi: ExtensionAPI) {
	pi.registerTool({
		name: "clickup_tasks",
		label: "ClickUp Tasks",
		description:
			"Tasks CRUD + search + status + tags. Actions: get, list_by_list, list_by_team (search), create, update, delete, set_status, add_tag, remove_tag, merge. NOTE: tags via PUT are a no-op — use add_tag/remove_tag.",
		parameters: TasksParams,

		async execute(_id, params) {
			const creds = await resolveCredentials();
			if (!creds.pat) return errResult({ error: true, code: "AUTH_MISSING", http_status: 0, message: "No ClickUp PAT configured", action_hint: "Run /clickup auth." });
			const result = await safeExecute(async () => {
				const client = await makeClient(creds.pat);
				const team = params.team_id || creds.team_id;
				switch (params.action) {
					case "get": {
						if (!params.task_id) throw new Error("task_id required");
						const qs = new URLSearchParams();
						if (typeof params.subtasks === "boolean") qs.set("subtasks", String(params.subtasks));
						return client.v2("GET", `/task/${params.task_id}${qs.toString() ? `?${qs}` : ""}`);
					}
					case "list_by_list": {
						if (!params.list_id) throw new Error("list_id required");
						const qs = new URLSearchParams();
						if (typeof params.include_closed === "boolean") qs.set("include_closed", String(params.include_closed));
						if (typeof params.subtasks === "boolean") qs.set("subtasks", String(params.subtasks));
						if (params.page) qs.set("page", String(params.page));
						if (params.order_by) qs.set("order_by", params.order_by);
						return client.v2("GET", `/list/${params.list_id}/task?${qs}`);
					}
					case "list_by_team": {
						if (!team) throw new Error("team_id required");
						const qs = new URLSearchParams();
						if (typeof params.include_closed === "boolean") qs.set("include_closed", String(params.include_closed));
						if (typeof params.subtasks === "boolean") qs.set("subtasks", String(params.subtasks));
						if (params.page) qs.set("page", String(params.page));
						if (params.order_by) qs.set("order_by", params.order_by);
						return client.v2("GET", `/team/${team}/task?${qs}`);
					}
					case "create": {
						if (!params.list_id || !params.name) throw new Error("list_id and name required");
						const body: any = { name: params.name };
						if (params.description) body.description = params.description;
						if (params.markdown_description) body.markdown_description = params.markdown_description;
						if (params.assignees_add) body.assignees = params.assignees_add;
						if (params.status) body.status = params.status;
						if (params.priority) body.priority = params.priority;
						if (params.due_date) {
							body.due_date = params.due_date;
							if (typeof params.due_date_time === "boolean") body.due_date_time = params.due_date_time;
						}
						if (params.start_date) {
							body.start_date = params.start_date;
							if (typeof params.start_date_time === "boolean") body.start_date_time = params.start_date_time;
						}
						if (params.parent) body.parent = params.parent;
						if (params.time_estimate) body.time_estimate = params.time_estimate;
						if (params.custom_fields) body.custom_fields = params.custom_fields;
						return client.v2("POST", `/list/${params.list_id}/task`, body);
					}
					case "update": {
						if (!params.task_id) throw new Error("task_id required");
						const body: any = {};
						if (params.name) body.name = params.name;
						if (params.description) body.description = params.description;
						if (params.markdown_description) body.markdown_description = params.markdown_description;
						if (params.status) body.status = params.status;
						if (params.priority) body.priority = params.priority;
						if (params.due_date !== undefined) {
							body.due_date = params.due_date;
							if (typeof params.due_date_time === "boolean") body.due_date_time = params.due_date_time;
						}
						if (params.start_date !== undefined) {
							body.start_date = params.start_date;
							if (typeof params.start_date_time === "boolean") body.start_date_time = params.start_date_time;
						}
						if (params.time_estimate !== undefined) body.time_estimate = params.time_estimate;
						if (params.assignees_add || params.assignees_rem) {
							body.assignees = { add: params.assignees_add || [], rem: params.assignees_rem || [] };
						}
						return client.v2("PUT", `/task/${params.task_id}`, body);
					}
					case "delete":
						if (!params.task_id) throw new Error("task_id required");
						return client.v2("DELETE", `/task/${params.task_id}`);
					case "set_status":
						if (!params.task_id || !params.status) throw new Error("task_id and status required");
						return client.v2("PUT", `/task/${params.task_id}`, { status: params.status });
					case "add_tag":
						if (!params.task_id || !params.tag_name) throw new Error("task_id and tag_name required");
						return client.v2("POST", `/task/${params.task_id}/tag/${encodeURIComponent(params.tag_name)}`);
					case "remove_tag":
						if (!params.task_id || !params.tag_name) throw new Error("task_id and tag_name required");
						return client.v2("DELETE", `/task/${params.task_id}/tag/${encodeURIComponent(params.tag_name)}`);
					case "merge": {
						if (!params.task_id || !params.task_ids || params.task_ids.length === 0)
							throw new Error("task_id and task_ids required for merge");
						return client.v2("POST", `/task/${params.task_id}/merge`, {});
					}
				}
			});
			return result.ok ? okResult(result.data) : errResult(result.error);
		},
	});
}
