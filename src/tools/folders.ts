/**
 * clickup_folders — CRUD for folders within a space.
 * v2 endpoints 11-15: list, create, get, update, delete.
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum, IdParam, safeExecute, okResult, errResult, makeClient } from "./shared.js";
import { resolveCredentials } from "../config.js";

const FoldersParams = Type.Object({
	action: StringEnum(["list_by_space", "get", "create", "update", "delete"] as const),
	space_id: Type.Optional(IdParam("Space id (for list_by_space/create)")),
	folder_id: Type.Optional(IdParam("Folder id (for get/update/delete)")),
	name: Type.Optional(Type.String({ description: "Folder name" })),
	parent_folder_id: Type.Optional(IdParam("Optional parent for nested folders")),
});

export function registerFoldersTool(pi: ExtensionAPI) {
	pi.registerTool({
		name: "clickup_folders",
		label: "ClickUp Folders",
		description: "Folders inside spaces. Actions: list_by_space, get, create, update, delete.",
		parameters: FoldersParams,

		async execute(_id, params) {
			const creds = await resolveCredentials();
			if (!creds.pat) return errResult({ error: true, code: "AUTH_MISSING", http_status: 0, message: "No ClickUp PAT configured", action_hint: "Run /clickup auth." });
			const result = await safeExecute(async () => {
				const client = await makeClient(creds.pat);
				switch (params.action) {
					case "list_by_space":
						if (!params.space_id) throw new Error("space_id required");
						return client.v2("GET", `/space/${params.space_id}/folder`);
					case "get":
						if (!params.folder_id) throw new Error("folder_id required");
						return client.v2("GET", `/folder/${params.folder_id}`);
					case "create": {
						if (!params.space_id || !params.name) throw new Error("space_id and name required");
						const body: any = { name: params.name };
						if (params.parent_folder_id) body.parent = params.parent_folder_id;
						return client.v2("POST", `/space/${params.space_id}/folder`, body);
					}
					case "update":
						if (!params.folder_id || !params.name) throw new Error("folder_id and name required");
						return client.v2("PUT", `/folder/${params.folder_id}`, { name: params.name });
					case "delete":
						if (!params.folder_id) throw new Error("folder_id required");
						return client.v2("DELETE", `/folder/${params.folder_id}`);
				}
			});
			return result.ok ? okResult(result.data) : errResult(result.error);
		},
	});
}
