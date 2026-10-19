/**
 * clickup_docs — Docs + Pages via v3 API.
 * v3 endpoints 162-169. Docs themselves are create/read at the doc level;
 * pages are full CRUD. Docs have format limitations (no checklists/banners/columns/embeds/colors).
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum, IdParam, safeExecute, okResult, errResult, makeClient } from "./shared.js";
import { resolveCredentials } from "../config.js";

const DocsParams = Type.Object({
	action: StringEnum(["list_workspace", "create", "get", "list_pages", "get_pages", "create_page", "get_page", "edit_page"] as const),
	workspace_id: Type.Optional(IdParam("Workspace id (defaults to config; v3 uses workspace_id instead of team_id)")),
	doc_id: Type.Optional(IdParam("Doc id (for get/list_pages/get_pages/create_page)")),
	page_id: Type.Optional(IdParam("Page id (for get_page/edit_page)")),
	name: Type.Optional(Type.String({ description: "Doc or page name" })),
	parent_id: Type.Optional(IdParam("Parent page or doc id" })),
	parent_type: Type.Optional(Type.String({ description: "DOC | PAGE" })),
	content: Type.Optional(Type.String({ description: "Page content (markdown-like)" })),
	content_format: Type.Optional(Type.String({ description: "text/md" })),
	visibility: Type.Optional(Type.String({ description: "PRIVATE | WORKSPACE | PUBLIC" })),
	location_id: Type.Optional(IdParam("Space/Folder/List id where the doc is created" })),
	location_type: Type.Optional(Type.String({ description: "SPACE | FOLDER | LIST" })),
});

export function registerDocsTool(pi: ExtensionAPI) {
	pi.registerTool({
		name: "clickup_docs",
		label: "ClickUp Docs",
		description:
			"Docs (create/read at doc level) and Pages (full CRUD). v3 API. Docs have format limitations (no checklists/banners/columns/embeds/colors).",
		parameters: DocsParams,

		async execute(_id, params) {
			const creds = await resolveCredentials();
			if (!creds.pat) return errResult({ error: true, code: "AUTH_MISSING", http_status: 0, message: "No ClickUp PAT configured", action_hint: "Run /clickup auth." });
			const ws = params.workspace_id || creds.team_id;
			if (!ws) return errResult({ error: true, code: "MISSING_PARAM", http_status: 0, message: "workspace_id required", action_hint: "Set default_team_id in /clickup config or pass workspace_id." });
			const result = await safeExecute(async () => {
				const client = await makeClient(creds.pat);
				switch (params.action) {
					case "list_workspace":
						return client.v3("GET", `/workspaces/${ws}/docs`);
					case "create": {
						if (!params.name) throw new Error("name required");
						const body: any = { name: params.name };
						if (params.parent_id) {
							body.parent = { id: Number(params.parent_id), type: params.parent_type || "DOC" };
						}
						if (params.visibility) body.visibility = params.visibility;
						if (params.location_id) {
							body.location = { id: Number(params.location_id), type: params.location_type || "SPACE" };
						}
						return client.v3("POST", `/workspaces/${ws}/docs`, body);
					}
					case "get":
						if (!params.doc_id) throw new Error("doc_id required");
						return client.v3("GET", `/workspaces/${ws}/docs/${params.doc_id}`);
					case "list_pages":
						if (!params.doc_id) throw new Error("doc_id required");
						return client.v3("GET", `/workspaces/${ws}/docs/${params.doc_id}/page_listing`);
					case "get_pages":
						if (!params.doc_id) throw new Error("doc_id required");
						return client.v3("GET", `/workspaces/${ws}/docs/${params.doc_id}/pages`);
					case "create_page": {
						if (!params.doc_id || !params.name) throw new Error("doc_id and name required");
						const body: any = { name: params.name };
						if (params.content) {
							body.content = [
								{
									type: "doc",
									children: [
										{ type: "paragraph", children: [{ type: "text", text: params.content }] },
									],
								},
							];
						}
						if (params.parent_id) {
							body.parent = { id: Number(params.parent_id), type: params.parent_type || "PAGE" };
						}
						return client.v3("POST", `/workspaces/${ws}/docs/${params.doc_id}/pages`, body);
					}
					case "get_page":
						if (!params.doc_id || !params.page_id) throw new Error("doc_id and page_id required");
						return client.v3("GET", `/workspaces/${ws}/docs/${params.doc_id}/pages/${params.page_id}`);
					case "edit_page": {
						if (!params.doc_id || !params.page_id) throw new Error("doc_id and page_id required");
						const body: any = {};
						if (params.name) body.name = params.name;
						if (params.content) {
							body.content = [
								{
									type: "doc",
									children: [
										{ type: "paragraph", children: [{ type: "text", text: params.content }] },
									],
								},
							];
						}
						return client.v3("PUT", `/workspaces/${ws}/docs/${params.doc_id}/pages/${params.page_id}`, body);
					}
				}
			});
			return result.ok ? okResult(result.data) : errResult(result.error);
		},
	});
}
