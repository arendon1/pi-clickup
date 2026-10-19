/**
 * pi-clickup entry point.
 * - Registers /clickup command (config|auth|status)
 * - Registers 22 tools via the tool registry.
 * - No I/O at factory time (synchronous); work happens on session_start / command / tool call.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerAllTools } from "./src/tools/registry.js";
import { cmdAuth, cmdConfig, cmdStatus } from "./src/tui.js";

export default function (pi: ExtensionAPI) {
	// --- Tool registration (22 tools) ---
	registerAllTools(pi);

	// --- /clickup command ---
	pi.registerCommand("clickup", {
		description: "Configure and inspect pi-clickup: auth (paste PAT), config (settings), status (whoami/plan)",
		handler: async (args, ctx) => {
			const sub = (args || "").trim().split(/\s+/)[0] || "";
			if (sub === "auth") return cmdAuth(args, ctx);
			if (sub === "config") return cmdConfig(args, ctx);
			if (sub === "status") return cmdStatus(args, ctx);
			// No subcommand: show status by default
			return cmdStatus(args, ctx);
		},
	});
}
