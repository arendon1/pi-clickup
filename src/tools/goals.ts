/**
 * clickup_goals — Goals + Key Results.
 * v2 endpoints 72-79.
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum, IdParam, safeExecute, okResult, errResult, makeClient } from "./shared.js";
import { resolveCredentials } from "../config.js";

const GoalsParams = Type.Object({
	action: StringEnum(["list", "get", "create", "update", "delete", "create_key_result", "update_key_result", "delete_key_result"] as const),
	team_id: Type.Optional(IdParam("Workspace id (defaults to config)")),
	goal_id: Type.Optional(IdParam("Goal id")),
	key_result_id: Type.Optional(IdParam("Key Result id")),
	name: Type.Optional(Type.String()),
	description: Type.Optional(Type.String()),
	due_date: Type.Optional(Type.Number({ description: "ms epoch" })),
	color: Type.Optional(Type.String()),
	// key result
	targets: Type.Optional(Type.Array(Type.Object({ id: Type.Optional(Type.String()), name: Type.String(), type: Type.String(), target: Type.Optional(Type.Any()), current: Type.Optional(Type.Any()) }))),
	type: Type.Optional(Type.String({ description: "Key result type: number, currency, boolean, etc." })),
	steps_start: Type.Optional(Type.Number({ description: "For stepped KR: starting value" })),
	steps_end: Type.Optional(Type.Number({ description: "For stepped KR: ending value" })),
	unit: Type.Optional(Type.String()),
	creator: Type.Optional(Type.Number({ description: "User id" })),
});

export function registerGoalsTool(pi: ExtensionAPI) {
	pi.registerTool({
		name: "clickup_goals",
		label: "ClickUp Goals",
		description: "Goals and Key Results. Actions: list, get, create, update, delete; create_key_result, update_key_result, delete_key_result.",
		parameters: GoalsParams,

		async execute(_id, params) {
			const creds = await resolveCredentials();
			if (!creds.pat) return errResult({ error: true, code: "AUTH_MISSING", http_status: 0, message: "No ClickUp PAT configured", action_hint: "Run /clickup auth." });
			const team = params.team_id || creds.team_id;
			if (!team) return errResult({ error: true, code: "MISSING_PARAM", http_status: 0, message: "team_id required", action_hint: "Set default_team_id in /clickup config or pass team_id." });
			const result = await safeExecute(async () => {
				const client = await makeClient(creds.pat);
				switch (params.action) {
					case "list":
						return client.v2("GET", `/team/${team}/goal`);
					case "get":
						if (!params.goal_id) throw new Error("goal_id required");
						return client.v2("GET", `/goal/${params.goal_id}`);
					case "create": {
						if (!params.name) throw new Error("name required");
						const body: any = { name: params.name };
						if (params.description) body.description = params.description;
						if (params.due_date) body.due_date = params.due_date;
						if (params.color) body.color = params.color;
						if (params.targets) body.targets = params.targets;
						if (params.creator) body.creator = params.creator;
						return client.v2("POST", `/team/${team}/goal`, body);
					}
					case "update": {
						if (!params.goal_id) throw new Error("goal_id required");
						const body: any = {};
						if (params.name) body.name = params.name;
						if (params.description) body.description = params.description;
						if (params.due_date !== undefined) body.due_date = params.due_date;
						if (params.color) body.color = params.color;
						return client.v2("PUT", `/goal/${params.goal_id}`, body);
					}
					case "delete":
						if (!params.goal_id) throw new Error("goal_id required");
						return client.v2("DELETE", `/goal/${params.goal_id}`);
					case "create_key_result": {
						if (!params.goal_id || !params.name || !params.type) throw new Error("goal_id, name, type required");
						const body: any = { name: params.name, type: params.type };
						if (params.targets) body.targets = params.targets;
						if (params.unit) body.unit = params.unit;
						if (params.steps_start !== undefined) body.steps_start = params.steps_start;
						if (params.steps_end !== undefined) body.steps_end = params.steps_end;
						if (params.creator) body.creator = params.creator;
						return client.v2("POST", `/goal/${params.goal_id}/key_result`, body);
					}
					case "update_key_result": {
						if (!params.key_result_id) throw new Error("key_result_id required");
						const body: any = {};
						if (params.name) body.name = params.name;
						if (params.targets) body.targets = params.targets;
						if (params.unit) body.unit = params.unit;
						return client.v2("PUT", `/key_result/${params.key_result_id}`, body);
					}
					case "delete_key_result":
						if (!params.key_result_id) throw new Error("key_result_id required");
						return client.v2("DELETE", `/key_result/${params.key_result_id}`);
				}
			});
			return result.ok ? okResult(result.data) : errResult(result.error);
		},
	});
}
