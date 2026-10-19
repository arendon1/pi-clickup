/**
 * clickup_users — whoami + workspace members + custom roles + shared hierarchy + guests.
 * 5 v2 endpoints (40-44 in RESEARCH.md): whoami (2), teams (3), custom roles (114), shared hierarchy (115), guests batch.
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum, IdParam, safeExecute, okResult, errResult, makeClient } from "./shared.js";
import { resolveCredentials } from "../config.js";

const UsersParams = Type.Object({
	action: StringEnum(["whoami", "list_workspaces", "list_members", "get_custom_roles", "shared_hierarchy", "get_user", "get_guest"] as const),
	team_id: Type.Optional(IdParam("Workspace id (defaults to config)")),
	user_id: Type.Optional(IdParam("User id (for get_user)")),
	guest_id: Type.Optional(IdParam("Guest id (for get_guest)")),
});

export function registerUsersTool(pi: ExtensionAPI) {
	pi.registerTool({
		name: "clickup_users",
		label: "ClickUp Users",
		description:
			"ClickUp users and members. Actions: whoami, list_workspaces, list_members (per workspace), get_custom_roles, shared_hierarchy, get_user (Enterprise), get_guest (Enterprise).",
		parameters: UsersParams,

		async execute(_id, params, signal) {
			const creds = await resolveCredentials();
			if (!creds.pat) {
				return errResult({
					error: true,
					code: "AUTH_MISSING",
					http_status: 0,
					message: "No ClickUp PAT configured",
					action_hint: "Run /clickup auth in pi TUI to set one up.",
				});
			}
			const result = await safeExecute(async () => {
				const client = await makeClient(creds.pat);
				const team = params.team_id || creds.team_id;
				switch (params.action) {
					case "whoami":
						return client.v2("GET", "/user");
					case "list_workspaces":
						return client.v2("GET", "/team");
					case "list_members":
						if (!team) throw new Error("team_id required for list_members");
						return client.v2("GET", `/team/${team}/user`);
					case "get_custom_roles":
						if (!team) throw new Error("team_id required for get_custom_roles");
						return client.v2("GET", `/team/${team}/role`);
					case "shared_hierarchy":
						if (!team) throw new Error("team_id required for shared_hierarchy");
						return client.v2("GET", `/team/${team}/share`);
					case "get_user":
						if (!team || !params.user_id)
							throw new Error("team_id and user_id required for get_user (Enterprise)");
						return client.v2("GET", `/team/${team}/user/${params.user_id}`);
					case "get_guest":
						if (!team || !params.guest_id)
							throw new Error("team_id and guest_id required for get_guest (Enterprise)");
						return client.v2("GET", `/team/${team}/guest/${params.guest_id}`);
				}
			});
			return result.ok ? okResult(result.data) : errResult(result.error);
		},
	});
}
