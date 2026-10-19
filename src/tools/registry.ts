/**
 * Tool registry. Each domain tool is a separate file in this folder.
 * Tools are registered with pi here in a single export for the entry point.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerUsersTool } from "./users.js";
import { registerSpacesTool } from "./spaces.js";
import { registerFoldersTool } from "./folders.js";
import { registerListsTool } from "./lists.js";
import { registerTasksTool } from "./tasks.js";
import { registerCommentsTool } from "./comments.js";
import { registerChecklistsTool } from "./checklists.js";
import { registerTagsTool } from "./tags.js";
import { registerTimeTool } from "./time.js";
import { registerGoalsTool } from "./goals.js";
import { registerViewsTool } from "./views.js";
import { registerWebhooksTool } from "./webhooks.js";
import { registerRelationshipsTool } from "./relationships.js";
import { registerTemplatesTool } from "./templates.js";
import { registerAttachmentsTool } from "./attachments.js";
import { registerGroupsTool } from "./groups.js";
import { registerAuditTool } from "./audit.js";
import { registerDocsTool } from "./docs.js";
import { registerChatTool } from "./chat.js";
import { registerConfigTool } from "./config-tool.js";

export function registerAllTools(pi: ExtensionAPI): void {
	registerUsersTool(pi);
	registerSpacesTool(pi);
	registerFoldersTool(pi);
	registerListsTool(pi);
	registerTasksTool(pi);
	registerCommentsTool(pi);
	registerChecklistsTool(pi);
	registerTagsTool(pi);
	registerTimeTool(pi);
	registerGoalsTool(pi);
	registerViewsTool(pi);
	registerWebhooksTool(pi);
	registerRelationshipsTool(pi);
	registerTemplatesTool(pi);
	registerAttachmentsTool(pi);
	registerGroupsTool(pi);
	registerAuditTool(pi);
	registerDocsTool(pi);
	registerChatTool(pi);
	registerConfigTool(pi);
}
