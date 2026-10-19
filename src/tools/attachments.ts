/**
 * clickup_attachments — upload + list + get.
 * v2 (legacy upload) + v3 (get/create by parent).
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum, IdParam, safeExecute, okResult, errResult, makeClient } from "./shared.js";
import { resolveCredentials } from "../config.js";
import { readFile } from "node:fs/promises";

const AttachmentsParams = Type.Object({
	action: StringEnum(["upload_v2_task", "list_v3", "create_v3", "delete_v3"] as const),
	task_id: Type.Optional(IdParam("Task id (for upload_v2_task)")),
	workspace_id: Type.Optional(IdParam("Workspace id (for v3 actions)")),
	attachment_id: Type.Optional(IdParam("Attachment id (for delete_v3)")),
	parent_id: Type.Optional(IdParam("Parent entity id (v3 get/create)")),
	parent_type: Type.Optional(Type.String({ description: "task | list | folder | space (v3)" })),
	file_path: Type.Optional(Type.String({ description: "Local path to file (for upload_v2_task)" })),
	name: Type.Optional(Type.String({ description: "Attachment name (for create_v3)" })),
	data: Type.Optional(Type.String({ description: "Inline data (for create_v3 small payloads)" })),
});

export function registerAttachmentsTool(pi: ExtensionAPI) {
	pi.registerTool({
		name: "clickup_attachments",
		label: "ClickUp Attachments",
		description:
			"Attachments: upload_v2_task (multipart), list_v3 (by parent), create_v3, delete_v3. Max 1 GB per file.",
		parameters: AttachmentsParams,

		async execute(_id, params, signal) {
			const creds = await resolveCredentials();
			if (!creds.pat) return errResult({ error: true, code: "AUTH_MISSING", http_status: 0, message: "No ClickUp PAT configured", action_hint: "Run /clickup auth." });
			const result = await safeExecute(async () => {
				const client = await makeClient(creds.pat);
				switch (params.action) {
					case "upload_v2_task": {
						if (!params.task_id || !params.file_path) throw new Error("task_id and file_path required");
						// v2 upload uses multipart/form-data on a separate endpoint. We bypass the
						// json-only client for this. Implemented in a sub-call to keep api.ts simple.
						const { readFile } = await import("node:fs/promises");
						const buf = await readFile(params.file_path);
						const blob = new Blob([buf]);
						const form = new FormData();
						form.append("attachment", blob, params.name || params.file_path.split("/").pop() || "file");
						const url = `${(await import("../config.js")).loadConfig().then((c) => c?.base_url_v2 || "https://api.clickup.com/api/v2")}/task/${params.task_id}/attachment`;
						const res = await fetch(url, { method: "POST", headers: { Authorization: creds.pat }, body: form, signal });
						const text = await res.text();
						if (!res.ok) {
							const { errorFromResponse, ClickUpError } = await import("../errors.js");
							throw new ClickUpError(errorFromResponse(res.status, text));
						}
						return text ? JSON.parse(text) : {};
					}
					case "list_v3": {
						if (!params.workspace_id || !params.parent_id || !params.parent_type)
							throw new Error("workspace_id, parent_id, parent_type required");
						return client.v3("GET", `/workspaces/${params.workspace_id}/${params.parent_type}/${params.parent_id}/attachments`);
					}
					case "create_v3": {
						if (!params.workspace_id || !params.parent_id || !params.parent_type)
							throw new Error("workspace_id, parent_id, parent_type required");
						const body: any = { name: params.name || "file" };
						if (params.data) body.data = params.data;
						return client.v3("POST", `/workspaces/${params.workspace_id}/${params.parent_type}/${params.parent_id}/attachments`, body);
					}
					case "delete_v3":
						if (!params.workspace_id || !params.attachment_id)
							throw new Error("workspace_id and attachment_id required");
						return client.v3("DELETE", `/workspaces/${params.workspace_id}/attachments/${params.attachment_id}`);
				}
			});
			return result.ok ? okResult(result.data) : errResult(result.error);
		},
	});
}
