/**
 * clickup_comments — task + list comments.
 * v2 endpoints 49-58.
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum, IdParam, safeExecute, okResult, errResult, makeClient } from "./shared.js";
import { resolveCredentials } from "../config.js";

const CommentsParams = Type.Object({
	action: StringEnum(["list_task", "create_task", "list_list", "create_list", "update", "delete", "get_thread", "create_thread"] as const),
	task_id: Type.Optional(IdParam("Task id (for task comments)")),
	list_id: Type.Optional(IdParam("List id (for list comments)")),
	comment_id: Type.Optional(IdParam("Comment id (for update/delete/get_thread/create_thread)")),
	comment_text: Type.Optional(Type.String({ description: "Comment body" })),
	assignee: Type.Optional(Type.Number({ description: "Assign to user (for create_task)" })),
	resolved: Type.Optional(Type.Boolean({ description: "Mark as resolved (for update)" })),
	start: Type.Optional(Type.Number({ description: "Pagination start id" })),
	start_id: Type.Optional(Type.Number({ description: "Pagination start_id" })),
});

export function registerCommentsTool(pi: ExtensionAPI) {
	pi.registerTool({
		name: "clickup_comments",
		label: "ClickUp Comments",
		description: "Comments on tasks and lists. Actions: list_task, create_task, list_list, create_list, update, delete, get_thread, create_thread.",
		parameters: CommentsParams,

		async execute(_id, params) {
			const creds = await resolveCredentials();
			if (!creds.pat) return errResult({ error: true, code: "AUTH_MISSING", http_status: 0, message: "No ClickUp PAT configured", action_hint: "Run /clickup auth." });
			const result = await safeExecute(async () => {
				const client = await makeClient(creds.pat);
				switch (params.action) {
					case "list_task": {
						if (!params.task_id) throw new Error("task_id required");
						const qs = new URLSearchParams();
						if (params.start) qs.set("start", String(params.start));
						if (params.start_id) qs.set("start_id", String(params.start_id));
						return client.v2("GET", `/task/${params.task_id}/comment?${qs}`);
					}
					case "create_task": {
						if (!params.task_id || !params.comment_text) throw new Error("task_id and comment_text required");
						const body: any = { comment_text: params.comment_text };
						if (params.assignee) body.assignee = params.assignee;
						return client.v2("POST", `/task/${params.task_id}/comment`, body);
					}
					case "list_list":
						if (!params.list_id) throw new Error("list_id required");
						return client.v2("GET", `/list/${params.list_id}/comment`);
					case "create_list": {
						if (!params.list_id || !params.comment_text) throw new Error("list_id and comment_text required");
						return client.v2("POST", `/list/${params.list_id}/comment`, { comment_text: params.comment_text });
					}
					case "update": {
						if (!params.comment_id || !params.comment_text) throw new Error("comment_id and comment_text required");
						const body: any = { comment_text: params.comment_text };
						if (typeof params.resolved === "boolean") body.resolved = params.resolved;
						return client.v2("PUT", `/comment/${params.comment_id}`, body);
					}
					case "delete":
						if (!params.comment_id) throw new Error("comment_id required");
						return client.v2("DELETE", `/comment/${params.comment_id}`);
					case "get_thread":
						if (!params.task_id || !params.comment_id) throw new Error("task_id and comment_id required");
						return client.v2("GET", `/task/${params.task_id}/comment/${params.comment_id}/thread`);
					case "create_thread":
						if (!params.task_id || !params.comment_id || !params.comment_text)
							throw new Error("task_id, comment_id and comment_text required");
						return client.v2("POST", `/task/${params.task_id}/comment/${params.comment_id}`, { comment_text: params.comment_text });
				}
			});
			return result.ok ? okResult(result.data) : errResult(result.error);
		},
	});
}
