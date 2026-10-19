/**
 * clickup_templates — list task, list, and folder templates.
 * v2 endpoints 97-99.
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum, IdParam, safeExecute, okResult, errResult, makeClient } from "./shared.js";
import { resolveCredentials } from "../config.js";

const TemplatesParams = Type.Object({
	action: StringEnum(["list_task_templates", "list_list_templates", "list_folder_templates"] as const),
	team_id: Type.Optional(IdParam("Workspace id (defaults to config)")),
	page: Type.Optional(Type.Number({ description: "Pagination" })),
});

export function registerTemplatesTool(pi: ExtensionAPI) {
	pi.registerTool({
		name: "clickup_templates",
		label: "ClickUp Templates",
		description: "List task, list, and folder templates for a workspace. Use them by passing template_id in clickup_tasks.create.",
		parameters: TemplatesParams,

		async execute(_id, params) {
			const creds = await resolveCredentials();
			if (!creds.pat) return errResult({ error: true, code: "AUTH_MISSING", http_status: 0, message: "No ClickUp PAT configured", action_hint: "Run /clickup auth." });
			const team = params.team_id || creds.team_id;
			if (!team) return errResult({ error: true, code: "MISSING_PARAM", http_status: 0, message: "team_id required", action_hint: "Set default_team_id in /clickup config or pass team_id." });
			const result = await safeExecute(async () => {
				const client = await makeClient(creds.pat);
				const qs = params.page ? `?page=${params.page}` : "";
				switch (params.action) {
					case "list_task_templates":
						return client.v2("GET", `/team/${team}/task_template${qs}`);
					case "list_list_templates":
						return client.v2("GET", `/team/${team}/list_template${qs}`);
					case "list_folder_templates":
						return client.v2("GET", `/team/${team}/folder_template${qs}`);
				}
			});
			return result.ok ? okResult(result.data) : errResult(result.error);
		},
	});
}
