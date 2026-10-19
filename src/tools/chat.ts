/**
 * clickup_chat — Chat channels, messages, replies, reactions.
 * v3 endpoints 142-161. Marked experimental by ClickUp ("subject to change at any time").
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum, IdParam, safeExecute, okResult, errResult, makeClient } from "./shared.js";
import { resolveCredentials } from "../config.js";

const ChatParams = Type.Object({
	action: StringEnum([
		"list_channels",
		"create_channel",
		"create_location_channel",
		"create_direct_message",
		"get_channel",
		"update_channel",
		"delete_channel",
		"get_channel_followers",
		"get_channel_members",
		"list_messages",
		"send_message",
		"update_message",
		"delete_message",
		"get_message_reactions",
		"create_reaction",
		"delete_reaction",
		"get_message_replies",
		"create_reply",
		"get_message_tagged_users",
		"get_subtypes",
	] as const),
	workspace_id: Type.Optional(IdParam("Workspace id (defaults to config)")),
	channel_id: Type.Optional(IdParam("Channel id")),
	message_id: Type.Optional(IdParam("Message id")),
	reaction_id: Type.Optional(IdParam("Reaction id")),
	name: Type.Optional(Type.String({ description: "Channel name" })),
	description: Type.Optional(Type.String()),
	visibility: Type.Optional(Type.String({ description: "PUBLIC | PRIVATE" })),
	member_ids: Type.Optional(Type.Array(Type.Number(), { description: "Channel members" })),
	// location channel
	location_id: Type.Optional(IdParam("Space/Folder/List id for create_location_channel" })),
	location_type: Type.Optional(Type.String({ description: "SPACE | FOLDER | LIST" })),
	// DM
	user_ids: Type.Optional(Type.Array(Type.Number(), { description: "DM user ids (max 15)" })),
	// message
	content: Type.Optional(Type.String({ description: "Message text" })),
	content_format: Type.Optional(Type.String({ description: "text/md" })),
	post_subtype: Type.Optional(Type.String({ description: "e.g. 'UPDATE' (use get_subtypes to discover ids)" })),
	// reaction
	reaction: Type.Optional(Type.String({ description: "Emoji, e.g. 👍" })),
});

export function registerChatTool(pi: ExtensionAPI) {
	pi.registerTool({
		name: "clickup_chat",
		label: "ClickUp Chat",
		description:
			"Chat channels + messages + reactions + DMs. v3 API (marked experimental by ClickUp — design tolerates breaking changes).",
		parameters: ChatParams,

		async execute(_id, params) {
			const creds = await resolveCredentials();
			if (!creds.pat) return errResult({ error: true, code: "AUTH_MISSING", http_status: 0, message: "No ClickUp PAT configured", action_hint: "Run /clickup auth." });
			const ws = params.workspace_id || creds.team_id;
			if (!ws) return errResult({ error: true, code: "MISSING_PARAM", http_status: 0, message: "workspace_id required", action_hint: "Set default_team_id in /clickup config or pass workspace_id." });
			const result = await safeExecute(async () => {
				const client = await makeClient(creds.pat);
				switch (params.action) {
					case "list_channels":
						return client.v3("GET", `/workspaces/${ws}/chat/channels`);
					case "create_channel": {
						if (!params.name) throw new Error("name required");
						const body: any = { name: params.name };
						if (params.description) body.description = params.description;
						if (params.visibility) body.visibility = params.visibility;
						if (params.member_ids) body.member_ids = params.member_ids;
						return client.v3("POST", `/workspaces/${ws}/chat/channels`, body);
					}
					case "create_location_channel": {
						if (!params.name || !params.location_id || !params.location_type)
							throw new Error("name, location_id, location_type required");
						const body: any = { name: params.name, location_id: Number(params.location_id), location_type: params.location_type };
						if (params.description) body.description = params.description;
						if (params.member_ids) body.member_ids = params.member_ids;
						return client.v3("POST", `/workspaces/${ws}/chat/${params.location_type.toLowerCase()}/${params.location_id}/channels`, body);
					}
					case "create_direct_message": {
						if (!params.user_ids || params.user_ids.length === 0) throw new Error("user_ids required (max 15)");
						return client.v3("POST", `/workspaces/${ws}/chat/direct_message`, { user_ids: params.user_ids });
					}
					case "get_channel":
						if (!params.channel_id) throw new Error("channel_id required");
						return client.v3("GET", `/workspaces/${ws}/chat/channels/${params.channel_id}`);
					case "update_channel": {
						if (!params.channel_id) throw new Error("channel_id required");
						const body: any = {};
						if (params.name) body.name = params.name;
						if (params.description) body.description = params.description;
						if (params.visibility) body.visibility = params.visibility;
						if (params.member_ids) body.member_ids = params.member_ids;
						return client.v3("PATCH", `/workspaces/${ws}/chat/channels/${params.channel_id}`, body);
					}
					case "delete_channel":
						if (!params.channel_id) throw new Error("channel_id required");
						return client.v3("DELETE", `/workspaces/${ws}/chat/channels/${params.channel_id}`);
					case "get_channel_followers":
						if (!params.channel_id) throw new Error("channel_id required");
						return client.v3("GET", `/workspaces/${ws}/chat/channels/${params.channel_id}/followers`);
					case "get_channel_members":
						if (!params.channel_id) throw new Error("channel_id required");
						return client.v3("GET", `/workspaces/${ws}/chat/channels/${params.channel_id}/members`);
					case "list_messages": {
						if (!params.channel_id) throw new Error("channel_id required");
						return client.v3("GET", `/workspaces/${ws}/chat/channels/${params.channel_id}/messages`);
					}
					case "send_message": {
						if (!params.channel_id || !params.content) throw new Error("channel_id and content required");
						const body: any = { content: params.content };
						if (params.content_format) body.content_format = params.content_format;
						if (params.post_subtype) body.post_subtype = params.post_subtype;
						return client.v3("POST", `/workspaces/${ws}/chat/channels/${params.channel_id}/messages`, body);
					}
					case "update_message": {
						if (!params.message_id || !params.content) throw new Error("message_id and content required");
						return client.v3("PATCH", `/workspaces/${ws}/chat/messages/${params.message_id}`, { content: params.content });
					}
					case "delete_message":
						if (!params.message_id) throw new Error("message_id required");
						return client.v3("DELETE", `/workspaces/${ws}/chat/messages/${params.message_id}`);
					case "get_message_reactions":
						if (!params.message_id) throw new Error("message_id required");
						return client.v3("GET", `/workspaces/${ws}/chat/messages/${params.message_id}/reactions`);
					case "create_reaction":
						if (!params.message_id || !params.reaction) throw new Error("message_id and reaction required");
						return client.v3("POST", `/workspaces/${ws}/chat/messages/${params.message_id}/reactions`, { reaction: params.reaction });
					case "delete_reaction":
						if (!params.message_id || !params.reaction_id) throw new Error("message_id and reaction_id required");
						return client.v3("DELETE", `/workspaces/${ws}/chat/messages/${params.message_id}/reactions/${params.reaction_id}`);
					case "get_message_replies":
						if (!params.message_id) throw new Error("message_id required");
						return client.v3("GET", `/workspaces/${ws}/chat/messages/${params.message_id}/replies`);
					case "create_reply": {
						if (!params.message_id || !params.content) throw new Error("message_id and content required");
						return client.v3("POST", `/workspaces/${ws}/chat/messages/${params.message_id}/replies`, { content: params.content });
					}
					case "get_message_tagged_users":
						if (!params.message_id) throw new Error("message_id required");
						return client.v3("GET", `/workspaces/${ws}/chat/messages/${params.message_id}/tagged_users`);
					case "get_subtypes":
						return client.v3("GET", `/workspaces/${ws}/chat/subtypes`);
				}
			});
			return result.ok ? okResult(result.data) : errResult(result.error);
		},
	});
}
