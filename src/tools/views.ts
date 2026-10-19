/**
 * clickup_views — Views at 4 hierarchy levels: workspace, space, folder, list.
 * v2 endpoints 100-111 (12 endpoints).
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum, IdParam, safeExecute, okResult, errResult, makeClient } from "./shared.js";
import { resolveCredentials } from "../config.js";

const ViewsParams = Type.Object({
	action: StringEnum([
		"list_workspace",
		"list_space",
		"list_folder",
		"list_list",
		"create_workspace",
		"create_space",
		"create_folder",
		"create_list",
		"get",
		"update",
		"delete",
		"get_tasks",
	] as const),
	team_id: Type.Optional(IdParam("Workspace id (defaults to config)")),
	space_id: Type.Optional(IdParam("Space id")),
	folder_id: Type.Optional(IdParam("Folder id")),
	list_id: Type.Optional(IdParam("List id")),
	view_id: Type.Optional(IdParam("View id (for get/update/delete/get_tasks)")),
	name: Type.Optional(Type.String({ description: "View name (for create_*)" })),
	type: Type.Optional(Type.String({ description: "View type: list, board, calendar, gantt, timeline, map, activity, mind, workdoc, table" })),
	grouping: Type.Optional(Type.String({ description: "Grouping field" })),
	divide: Type.Optional(Type.String({ description: "Divide field (sub-grouping)" })),
	sorting: Type.Optional(Type.String({ description: "Sorting field" })),
	orderby: Type.Optional(Type.String({ description: "Order by" })),
	orderdir: Type.Optional(Type.Number({ description: "1=asc, -1=desc" })),
	filters: Type.Optional(Type.Any({ description: "Filters object" })),
	columns: Type.Optional(Type.Any({ description: "Columns object" })),
	page: Type.Optional(Type.Number()),
});

export function registerViewsTool(pi: ExtensionAPI) {
	pi.registerTool({
		name: "clickup_views",
		label: "ClickUp Views",
		description:
			"Views at 4 hierarchy levels. Actions: list_workspace, list_space, list_folder, list_list, create_workspace, create_space, create_folder, create_list, get, update, delete, get_tasks.",
		parameters: ViewsParams,

		async execute(_id, params) {
			const creds = await resolveCredentials();
			if (!creds.pat) return errResult({ error: true, code: "AUTH_MISSING", http_status: 0, message: "No ClickUp PAT configured", action_hint: "Run /clickup auth." });
			const team = params.team_id || creds.team_id;
			if (!team) return errResult({ error: true, code: "MISSING_PARAM", http_status: 0, message: "team_id required", action_hint: "Set default_team_id in /clickup config or pass team_id." });
			const result = await safeExecute(async () => {
				const client = await makeClient(creds.pat);
				switch (params.action) {
					case "list_workspace":
						return client.v2("GET", `/team/${team}/view`);
					case "list_space":
						if (!params.space_id) throw new Error("space_id required");
						return client.v2("GET", `/space/${params.space_id}/view`);
					case "list_folder":
						if (!params.folder_id) throw new Error("folder_id required");
						return client.v2("GET", `/folder/${params.folder_id}/view`);
					case "list_list":
						if (!params.list_id) throw new Error("list_id required");
						return client.v2("GET", `/list/${params.list_id}/view`);
					case "create_workspace": {
						if (!params.name || !params.type) throw new Error("name and type required");
						const body: any = { name: params.name, type: params.type };
						if (params.grouping) body.grouping = params.grouping;
						if (params.divide) body.divide = params.divide;
						if (params.sorting) body.sorting = params.sorting;
						if (params.filters) body.filters = params.filters;
						return client.v2("POST", `/team/${team}/view`, body);
					}
					case "create_space": {
						if (!params.space_id || !params.name || !params.type) throw new Error("space_id, name, type required");
						const body: any = { name: params.name, type: params.type };
						if (params.grouping) body.grouping = params.grouping;
						return client.v2("POST", `/space/${params.space_id}/view`, body);
					}
					case "create_folder": {
						if (!params.folder_id || !params.name || !params.type) throw new Error("folder_id, name, type required");
						return client.v2("POST", `/folder/${params.folder_id}/view`, { name: params.name, type: params.type });
					}
					case "create_list": {
						if (!params.list_id || !params.name || !params.type) throw new Error("list_id, name, type required");
						return client.v2("POST", `/list/${params.list_id}/view`, { name: params.name, type: params.type });
					}
					case "get":
						if (!params.view_id) throw new Error("view_id required");
						return client.v2("GET", `/view/${params.view_id}`);
					case "update": {
						if (!params.view_id) throw new Error("view_id required");
						const body: any = {};
						if (params.name) body.name = params.name;
						if (params.grouping) body.grouping = params.grouping;
						if (params.divide) body.divide = params.divide;
						if (params.sorting) body.sorting = params.sorting;
						if (params.orderby) body.orderby = params.orderby;
						if (params.orderdir !== undefined) body.orderdir = params.orderdir;
						if (params.filters) body.filters = params.filters;
						if (params.columns) body.columns = params.columns;
						return client.v2("PUT", `/view/${params.view_id}`, body);
					}
					case "delete":
						if (!params.view_id) throw new Error("view_id required");
						return client.v2("DELETE", `/view/${params.view_id}`);
					case "get_tasks": {
						if (!params.view_id) throw new Error("view_id required");
						const qs = new URLSearchParams();
						if (params.page) qs.set("page", String(params.page));
						return client.v2("GET", `/view/${params.view_id}/task?${qs}`);
					}
				}
			});
			return result.ok ? okResult(result.data) : errResult(result.error);
		},
	});
}
