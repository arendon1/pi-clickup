/**
 * clickup_config — non-CRUD status from the LLM.
 * Returns current config (PAT masked), plan tier, rate limit, and recent errors.
 * Note: the per-tool rate-state is in-memory; the tool exposes it for transparency.
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum, safeExecute, okResult, errResult, makeClient } from "./shared.js";
import { resolveCredentials, loadConfig, maskPat } from "../config.js";
import { limitForPlan } from "../rate-limit.js";

const ConfigToolParams = Type.Object({
	action: StringEnum(["status"] as const),
});

export function registerConfigTool(pi: ExtensionAPI) {
	pi.registerTool({
		name: "clickup_config",
		label: "ClickUp Config",
		description:
			"Status of the pi-clickup tool: whoami (if cache fresh), plan tier, effective rate limit, in-memory rate limiter state. Read-only.",
		parameters: ConfigToolParams,

		async execute(_id, params) {
			const creds = await resolveCredentials();
			if (!creds.pat) return errResult({ error: true, code: "AUTH_MISSING", http_status: 0, message: "No ClickUp PAT configured", action_hint: "Run /clickup auth." });
			const cfg = await loadConfig();
			const result = await safeExecute(async () => {
				const client = await makeClient(creds.pat);
				const state = client.rateState();
				let whoami: any = null;
				try {
					whoami = await client.v2("GET", "/user");
				} catch {
					whoami = null;
				}
				return {
					pat: maskPat(creds.pat),
					pat_source: creds.source,
					default_team_id: cfg?.default_team_id,
					plan: cfg?.plan ?? "free",
					plan_detected_at: cfg?.plan_detected_at,
					effective_rate_limit_per_min: limitForPlan(cfg?.plan),
					rate_margin: cfg?.rate_limit_margin,
					base_url_v2: cfg?.base_url_v2,
					base_url_v3: cfg?.base_url_v3,
					timeout_ms: cfg?.timeout_ms,
					max_retries: cfg?.max_retries,
					rate_state: {
						used_last_60s: state.timestamps.length,
						limit: state.limit,
						server_remaining: state.server_remaining,
						server_reset: state.server_reset,
					},
					whoami: whoami?.user ?? null,
				};
			});
			return result.ok ? okResult(result.data) : errResult(result.error);
		},
	});
}
