/**
 * clickup_groups — User Groups CRUD (assign groups, not just individual users).
 * v2 endpoints 116-119.
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum, IdParam, safeExecute, okResult, errResult, makeClient } from "./shared.js";
import { resolveCredentials } from "../config.js";

const GroupsParams = Type.Object({
	action: StringEnum(["list", "create", "update", "delete"] as const),
	team_id: Type.Optional(IdParam("Workspace id (defaults to config)")),
	group_id: Type.Optional(IdParam("Group id (for update/delete)")),
	name: Type.Optional(Type.String({ description: "Group name" })),
	member_ids_add: Type.Optional(Type.Array(Type.Number(), { description: "User ids to add to the group" })),
	member_ids_rem: Type.Optional(Type.Array(Type.Number(), { description: "User ids to remove from the group" })),
	handle: Type.Optional(Type.String({ description: "Group handle (e.g. @design)" })),
});

export function registerGroupsTool(pi: ExtensionAPI) {
	pi.registerTool({
		name: "clickup_groups",
		label: "ClickUp Groups",
		description: "User groups (teams). Actions: list, create, update, delete. Use member_ids_add/rem to manage membership.",
		parameters: GroupsParams,

		async execute(_id, params) {
			const creds = await resolveCredentials();
			if (!creds.pat) return errResult({ error: true, code: "AUTH_MISSING", http_status: 0, message: "No ClickUp PAT configured", action_hint: "Run /clickup auth." });
			const team = params.team_id || creds.team_id;
			if (!team) return errResult({ error: true, code: "MISSING_PARAM", http_status: 0, message: "team_id required", action_hint: "Set default_team_id in /clickup config or pass team_id." });
			const result = await safeExecute(async () => {
				const client = await makeClient(creds.pat);
				switch (params.action) {
					case "list":
						return client.v2("GET", `/team/${team}/group`);
					case "create": {
						if (!params.name) throw new Error("name required");
						const body: any = { name: params.name };
						if (params.member_ids_add) body.member_ids = params.member_ids_add;
						if (params.handle) body.handle = params.handle;
						return client.v2("POST", `/team/${team}/group`, body);
					}
					case "update": {
						if (!params.group_id) throw new Error("group_id required");
						const body: any = {};
						if (params.name) body.name = params.name;
						if (params.handle) body.handle = params.handle;
						if (params.member_ids_add || params.member_ids_rem) {
							body.member_ids = { add: params.member_ids_add || [], rem: params.member_ids_rem || [] };
						}
						return client.v2("PUT", `/group/${params.group_id}`, body);
					}
					case "delete":
						if (!params.group_id) throw new Error("group_id required");
						return client.v2("DELETE", `/group/${params.group_id}`);
				}
			});
			return result.ok ? okResult(result.data) : errResult(result.error);
		},
	});
}
