/**
 * clickup_tags — space tags CRUD + add/remove on tasks.
 * v2 endpoints 66-71.
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum, IdParam, safeExecute, okResult, errResult, makeClient } from "./shared.js";
import { resolveCredentials } from "../config.js";

const TagsParams = Type.Object({
	action: StringEnum(["list_space", "create_space_tag", "update_tag", "delete_tag", "add_to_task", "remove_from_task"] as const),
	space_id: Type.Optional(IdParam("Space id (for list_space/create_space_tag/update_tag/delete_tag)")),
	tag_name: Type.Optional(Type.String({ description: "Tag name (for create/update/delete/add/remove)" })),
	task_id: Type.Optional(IdParam("Task id (for add_to_task/remove_from_task)")),
	new_name: Type.Optional(Type.String({ description: "New tag name (for update_tag)" })),
	tag_fg: Type.Optional(Type.String({ description: "Foreground color hex (for create_space_tag/update_tag)" })),
	tag_bg: Type.Optional(Type.String({ description: "Background color hex (for create_space_tag/update_tag)" })),
});

export function registerTagsTool(pi: ExtensionAPI) {
	pi.registerTool({
		name: "clickup_tags",
		label: "ClickUp Tags",
		description: "Space-level tags. Actions: list_space, create_space_tag, update_tag, delete_tag, add_to_task, remove_from_task.",
		parameters: TagsParams,

		async execute(_id, params) {
			const creds = await resolveCredentials();
			if (!creds.pat) return errResult({ error: true, code: "AUTH_MISSING", http_status: 0, message: "No ClickUp PAT configured", action_hint: "Run /clickup auth." });
			const result = await safeExecute(async () => {
				const client = await makeClient(creds.pat);
				switch (params.action) {
					case "list_space":
						if (!params.space_id) throw new Error("space_id required");
						return client.v2("GET", `/space/${params.space_id}/tag`);
					case "create_space_tag": {
						if (!params.space_id || !params.tag_name) throw new Error("space_id and tag_name required");
						const body: any = { name: params.tag_name };
						if (params.tag_fg) body.tag_fg = params.tag_fg;
						if (params.tag_bg) body.tag_bg = params.tag_bg;
						return client.v2("POST", `/space/${params.space_id}/tag`, body);
					}
					case "update_tag": {
						if (!params.space_id || !params.tag_name || !params.new_name) throw new Error("space_id, tag_name and new_name required");
						const body: any = { name: params.new_name };
						if (params.tag_fg) body.tag_fg = params.tag_fg;
						if (params.tag_bg) body.tag_bg = params.tag_bg;
						return client.v2("PUT", `/space/${params.space_id}/tag/${encodeURIComponent(params.tag_name)}`, body);
					}
					case "delete_tag":
						if (!params.space_id || !params.tag_name) throw new Error("space_id and tag_name required");
						return client.v2("DELETE", `/space/${params.space_id}/tag/${encodeURIComponent(params.tag_name)}`);
					case "add_to_task":
						if (!params.task_id || !params.tag_name) throw new Error("task_id and tag_name required");
						return client.v2("POST", `/task/${params.task_id}/tag/${encodeURIComponent(params.tag_name)}`);
					case "remove_from_task":
						if (!params.task_id || !params.tag_name) throw new Error("task_id and tag_name required");
						return client.v2("DELETE", `/task/${params.task_id}/tag/${encodeURIComponent(params.tag_name)}`);
				}
			});
			return result.ok ? okResult(result.data) : errResult(result.error);
		},
	});
}
