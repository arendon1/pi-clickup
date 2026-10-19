/**
 * clickup_relationships — task dependencies (wait_for / depend_on) + task links.
 * v2 endpoints 45-48.
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum, IdParam, safeExecute, okResult, errResult, makeClient } from "./shared.js";
import { resolveCredentials } from "../config.js";

const RelationshipsParams = Type.Object({
	action: StringEnum(["add_dependency", "delete_dependency", "add_link", "delete_link"] as const),
	task_id: Type.Optional(IdParam("Task id (the task that has/will have the relationship)")),
	depends_on: Type.Optional(Type.String({ description: "Task id that this task depends on" })),
	dependency_of: Type.Optional(Type.String({ description: "Task id that depends on this task" })),
	link_to: Type.Optional(Type.String({ description: "Task id to link to" })),
	custom_task_ids: Type.Optional(Type.Boolean({ description: "Pass true if you used custom task ids" })),
});

export function registerRelationshipsTool(pi: ExtensionAPI) {
	pi.registerTool({
		name: "clickup_relationships",
		label: "ClickUp Relationships",
		description:
			"Task dependencies (wait_for/depend_on) and task links. Actions: add_dependency, delete_dependency, add_link, delete_link. Use depends_on or dependency_of (exactly one).",
		parameters: RelationshipsParams,

		async execute(_id, params) {
			const creds = await resolveCredentials();
			if (!creds.pat) return errResult({ error: true, code: "AUTH_MISSING", http_status: 0, message: "No ClickUp PAT configured", action_hint: "Run /clickup auth." });
			if (!params.task_id) return errResult({ error: true, code: "MISSING_PARAM", http_status: 0, message: "task_id required", action_hint: "Provide the task id." });
			const result = await safeExecute(async () => {
				const client = await makeClient(creds.pat);
				switch (params.action) {
					case "add_dependency": {
						if (!params.depends_on && !params.dependency_of)
							throw new Error("depends_on or dependency_of required");
						const body: any = {};
						if (params.depends_on) body.depends_on = params.depends_on;
						if (params.dependency_of) body.dependency_of = params.dependency_of;
						if (typeof params.custom_task_ids === "boolean") body.custom_task_ids = params.custom_task_ids;
						return client.v2("POST", `/task/${params.task_id}/dependency`, body);
					}
					case "delete_dependency": {
						if (!params.depends_on && !params.dependency_of)
							throw new Error("depends_on or dependency_of required");
						const body: any = {};
						if (params.depends_on) body.depends_on = params.depends_on;
						if (params.dependency_of) body.dependency_of = params.dependency_of;
						return client.v2("DELETE", `/task/${params.task_id}/dependency`, body);
					}
					case "add_link":
						if (!params.link_to) throw new Error("link_to required");
						return client.v2("POST", `/task/${params.task_id}/link`, { links_to: params.link_to });
					case "delete_link":
						if (!params.link_to) throw new Error("link_to required");
						return client.v2("DELETE", `/task/${params.task_id}/link`, { links_to: params.link_to });
				}
			});
			return result.ok ? okResult(result.data) : errResult(result.error);
		},
	});
}
