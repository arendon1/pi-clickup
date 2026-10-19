/**
 * clickup_time — Time Tracking v2 (13 endpoints) + legacy (4 endpoints).
 * v2 endpoints 80-96 in RESEARCH.md.
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum, IdParam, safeExecute, okResult, errResult, makeClient } from "./shared.js";
import { resolveCredentials } from "../config.js";

const TimeParams = Type.Object({
	action: StringEnum([
		// new model
		"list",
		"create",
		"get",
		"update",
		"delete",
		"get_history",
		"get_running",
		"start",
		"stop",
		"list_tags",
		"add_tags",
		"remove_tags",
		"change_tag_names",
		// legacy (deprecated, still works)
		"legacy_get_tracked",
		"legacy_track",
		"legacy_edit_tracked",
		"legacy_delete_tracked",
	] as const),
	team_id: Type.Optional(IdParam("Workspace id (defaults to config)")),
	task_id: Type.Optional(IdParam("Task id (for legacy endpoints)")),
	time_entry_id: Type.Optional(IdParam("Time entry id (for get/update/delete/history)")),
	// range filters
	start_date: Type.Optional(Type.Number({ description: "Start of range, ms epoch" })),
	end_date: Type.Optional(Type.Number({ description: "End of range, ms epoch" })),
	assignee: Type.Optional(Type.Number({ description: "Filter by user id (Business Plus+ for create)" })),
	// create
	tid: Type.Optional(Type.String({ description: "Task id for new entry (or use task_id)" })),
	description: Type.Optional(Type.String({ description: "Entry description" })),
	duration: Type.Optional(Type.Number({ description: "Duration in ms (negative means running timer)" })),
	start: Type.Optional(Type.Number({ description: "Start time, ms epoch" })),
	stop: Type.Optional(Type.Number({ description: "Stop time, ms epoch" })),
	tags: Type.Optional(Type.Array(Type.Object({ name: Type.String(), tag_bg: Type.Optional(Type.String()), tag_fg: Type.Optional(Type.String()) }))),
	billable: Type.Optional(Type.Boolean()),
	// tag changes
	tag_names: Type.Optional(Type.Array(Type.String())),
	time_entry_ids: Type.Optional(Type.Array(IdParam("Time entry ids (for add/remove/change tag names)"))),
});

export function registerTimeTool(pi: ExtensionAPI) {
	pi.registerTool({
		name: "clickup_time",
		label: "ClickUp Time",
		description:
			"Time tracking v2 (13 endpoints) + legacy. Actions: list, create, get, update, delete, get_history, get_running, start, stop, list_tags, add_tags, remove_tags, change_tag_names, legacy_*.",
		parameters: TimeParams,

		async execute(_id, params) {
			const creds = await resolveCredentials();
			if (!creds.pat) return errResult({ error: true, code: "AUTH_MISSING", http_status: 0, message: "No ClickUp PAT configured", action_hint: "Run /clickup auth." });
			const team = params.team_id || creds.team_id;
			if (!team) return errResult({ error: true, code: "MISSING_PARAM", http_status: 0, message: "team_id required", action_hint: "Set default_team_id in /clickup config or pass team_id." });
			const result = await safeExecute(async () => {
				const client = await makeClient(creds.pat);
				switch (params.action) {
					case "list": {
						const qs = new URLSearchParams();
						if (params.start_date) qs.set("start_date", String(params.start_date));
						if (params.end_date) qs.set("end_date", String(params.end_date));
						if (params.assignee) qs.set("assignee", String(params.assignee));
						return client.v2("GET", `/team/${team}/time_entries?${qs}`);
					}
					case "create": {
						const tid = params.tid || params.task_id;
						if (!tid) throw new Error("tid or task_id required for create");
						const body: any = { tid, description: params.description || "", duration: params.duration ?? 0 };
						if (typeof params.start === "number") body.start = params.start;
						if (typeof params.stop === "number") body.stop = params.stop;
						if (params.assignee) body.assignee = String(params.assignee);
						if (typeof params.billable === "boolean") body.billable = params.billable;
						if (params.tags) body.tags = params.tags;
						return client.v2("POST", `/team/${team}/time_entries`, body);
					}
					case "get":
						if (!params.time_entry_id) throw new Error("time_entry_id required");
						return client.v2("GET", `/team/${team}/time_entries/${params.time_entry_id}`);
					case "update": {
						if (!params.time_entry_id) throw new Error("time_entry_id required");
						const body: any = {};
						if (typeof params.duration === "number") body.duration = params.duration;
						if (typeof params.start === "number") body.start = params.start;
						if (typeof params.stop === "number") body.stop = params.stop;
						if (params.description) body.description = params.description;
						if (typeof params.billable === "boolean") body.billable = params.billable;
						if (params.tags) body.tags = params.tags;
						return client.v2("PUT", `/team/${team}/time_entries/${params.time_entry_id}`, body);
					}
					case "delete":
						if (!params.time_entry_id) throw new Error("time_entry_id required");
						return client.v2("DELETE", `/team/${team}/time_entries/${params.time_entry_id}`);
					case "get_history":
						if (!params.time_entry_id) throw new Error("time_entry_id required");
						return client.v2("GET", `/team/${team}/time_entries/${params.time_entry_id}/history`);
					case "get_running":
						return client.v2("GET", `/team/${team}/time_entries/running`);
					case "start": {
						const tid = params.tid || params.task_id;
						if (!tid) throw new Error("tid or task_id required for start");
						const body: any = { tid, description: params.description || "" };
						if (typeof params.billable === "boolean") body.billable = params.billable;
						return client.v2("POST", `/team/${team}/time_entries/start`, body);
					}
					case "stop":
						return client.v2("POST", `/team/${team}/time_entries/stop`);
					case "list_tags":
						return client.v2("GET", `/team/${team}/time_entries/tags`);
					case "add_tags": {
						if (!params.time_entry_ids || !params.tags) throw new Error("time_entry_ids and tags required");
						return client.v2("POST", `/team/${team}/time_entries/tags`, { time_entry_ids: params.time_entry_ids, tags: params.tags });
					}
					case "remove_tags": {
						if (!params.time_entry_ids || !params.tag_names) throw new Error("time_entry_ids and tag_names required");
						return client.v2("DELETE", `/team/${team}/time_entries/tags`, { time_entry_ids: params.time_entry_ids, tags: params.tag_names });
					}
					case "change_tag_names": {
						if (!params.tag_names) throw new Error("tag_names required (pairs of old_name, new_name)");
						return client.v2("PUT", `/team/${team}/time_entries/tags`, { tags: params.tag_names });
					}
					case "legacy_get_tracked":
						if (!params.task_id) throw new Error("task_id required");
						return client.v2("GET", `/task/${params.task_id}/time`);
					case "legacy_track": {
						if (!params.task_id) throw new Error("task_id required");
						const body: any = { description: params.description || "", duration: params.duration ?? 0 };
						if (typeof params.billable === "boolean") body.billable = params.billable;
						return client.v2("POST", `/task/${params.task_id}/time`, body);
					}
					case "legacy_edit_tracked": {
						if (!params.task_id || !params.time_entry_id) throw new Error("task_id and time_entry_id required");
						const body: any = {};
						if (params.description) body.description = params.description;
						if (typeof params.duration === "number") body.duration = params.duration;
						return client.v2("PUT", `/task/${params.task_id}/time`, { id: params.time_entry_id, ...body });
					}
					case "legacy_delete_tracked":
						if (!params.task_id || !params.time_entry_id) throw new Error("task_id and time_entry_id required");
						return client.v2("DELETE", `/task/${params.task_id}/time`, { id: params.time_entry_id });
				}
			});
			return result.ok ? okResult(result.data) : errResult(result.error);
		},
	});
}
