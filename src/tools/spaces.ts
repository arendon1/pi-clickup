/**
 * clickup_spaces — discovery + CRUD of workspaces' top-level containers.
 * v2 endpoints 6-10: list, create, get, update, delete.
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum, IdParam, safeExecute, okResult, errResult, makeClient } from "./shared.js";
import { resolveCredentials } from "../config.js";

const SpacesParams = Type.Object({
	action: StringEnum(["list_by_team", "get", "create", "update", "delete"] as const),
	team_id: Type.Optional(IdParam("Workspace id (defaults to config)")),
	space_id: Type.Optional(IdParam("Space id (for get/update/delete)")),
	name: Type.Optional(Type.String({ description: "Space name (for create/update)" })),
	color: Type.Optional(Type.String({ description: "Space color hex (e.g. #7A4FD8)" })),
	private: Type.Optional(Type.Boolean({ description: "Private space (for create)" })),
	admin_can_manage: Type.Optional(
		Type.Boolean({ description: "(update) Whether admins can manage. Enterprise-only." }),
	),
	multiple_assignees: Type.Optional(Type.Boolean({ description: "(update) Allow multiple assignees" })),
	features: Type.Optional(
		Type.Object(
			{
				due_dates: Type.Optional(Type.Boolean()),
				time_tracking: Type.Optional(Type.Boolean()),
				tags: Type.Optional(Type.Boolean()),
				time_estimates: Type.Optional(Type.Boolean()),
				checklists: Type.Optional(Type.Boolean()),
				custom_fields: Type.Optional(Type.Boolean()),
				remap_dependencies: Type.Optional(Type.Boolean()),
				dependency_warning: Type.Optional(Type.Boolean()),
				portfolios: Type.Optional(Type.Boolean()),
			},
			{ description: "(update) Space features toggle" },
		),
	),
	archive: Type.Optional(Type.Boolean({ description: "(update) archive the space" })),
});

export function registerSpacesTool(pi: ExtensionAPI) {
	pi.registerTool({
		name: "clickup_spaces",
		label: "ClickUp Spaces",
		description:
			"ClickUp spaces (top-level workspace containers). Actions: list_by_team, get, create, update, delete.",
		parameters: SpacesParams,

		async execute(_id, params, signal) {
			const creds = await resolveCredentials();
			if (!creds.pat) {
				return errResult({
					error: true,
					code: "AUTH_MISSING",
					http_status: 0,
					message: "No ClickUp PAT configured",
					action_hint: "Run /clickup auth in pi TUI.",
				});
			}
			const result = await safeExecute(async () => {
				const client = await makeClient(creds.pat);
				const team = params.team_id || creds.team_id;
				switch (params.action) {
					case "list_by_team":
						if (!team) throw new Error("team_id required for list_by_team");
						return client.v2("GET", `/team/${team}/space`);
					case "get":
						if (!params.space_id) throw new Error("space_id required for get");
						return client.v2("GET", `/space/${params.space_id}`);
					case "create": {
						if (!team) throw new Error("team_id required for create");
						if (!params.name) throw new Error("name required for create");
						const body: any = { name: params.name };
						if (params.color) body.color = params.color;
						if (typeof params.private === "boolean") body.private = params.private;
						if (params.features) body.features = params.features;
						return client.v2("POST", `/team/${team}/space`, body);
					}
					case "update": {
						if (!params.space_id) throw new Error("space_id required for update");
						const body: any = {};
						if (params.name) body.name = params.name;
						if (params.color) body.color = params.color;
						if (typeof params.private === "boolean") body.private = params.private;
						if (typeof params.admin_can_manage === "boolean")
							body.admin_can_manage = params.admin_can_manage;
						if (typeof params.multiple_assignees === "boolean")
							body.multiple_assignees = params.multiple_assignees;
						if (params.features) body.features = params.features;
						if (typeof params.archive === "boolean") body.archive = params.archive;
						return client.v2("PUT", `/space/${params.space_id}`, body);
					}
					case "delete":
						if (!params.space_id) throw new Error("space_id required for delete");
						return client.v2("DELETE", `/space/${params.space_id}`);
				}
			});
			return result.ok ? okResult(result.data) : errResult(result.error);
		},
	});
}
