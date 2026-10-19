/**
 * clickup_audit — workspace plan + seats + audit logs.
 * v2 endpoints 4-5 (seats, plan) + v3 endpoint 141 (audit logs, Enterprise-only).
 * Plan detection is what makes this useful: re-runs the limit on rate-limit window.
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum, IdParam, safeExecute, okResult, errResult, makeClient } from "./shared.js";
import { resolveCredentials, loadConfig, saveConfig, type PlanTier } from "../config.js";
import { limitForPlan } from "../rate-limit.js";

const AuditParams = Type.Object({
	action: StringEnum(["get_plan", "get_seats", "query_audit_logs", "redetect_plan"] as const),
	team_id: Type.Optional(IdParam("Workspace id (defaults to config)")),
	workspace_id: Type.Optional(IdParam("Workspace id (alias for team_id)")),
	start_date: Type.Optional(Type.Number({ description: "ms epoch" })),
	end_date: Type.Optional(Type.Number({ description: "ms epoch" })),
	user_id: Type.Optional(Type.Number({ description: "Filter audit logs by user id" })),
	entity_id: Type.Optional(Type.String({ description: "Filter audit logs by entity id" })),
	event_filter: Type.Optional(Type.String({ description: "Filter audit logs by event name" })),
});

export function registerAuditTool(pi: ExtensionAPI) {
	pi.registerTool({
		name: "clickup_audit",
		label: "ClickUp Audit",
		description:
			"Workspace plan, seats, and audit logs (Enterprise-only). Use redetect_plan to refresh the cached plan tier (which drives the rate-limit window).",
		parameters: AuditParams,

		async execute(_id, params) {
			const creds = await resolveCredentials();
			if (!creds.pat) return errResult({ error: true, code: "AUTH_MISSING", http_status: 0, message: "No ClickUp PAT configured", action_hint: "Run /clickup auth." });
			const team = params.team_id || params.workspace_id || creds.team_id;
			if (!team) return errResult({ error: true, code: "MISSING_PARAM", http_status: 0, message: "team_id required", action_hint: "Set default_team_id in /clickup config or pass team_id." });
			const result = await safeExecute(async () => {
				const client = await makeClient(creds.pat);
				switch (params.action) {
					case "get_plan":
						return client.v2("GET", `/workspaces/${team}/plan`);
					case "get_seats":
						return client.v2("GET", `/workspaces/${team}/seats`);
					case "query_audit_logs": {
						const body: any = {};
						if (params.start_date) body.start_date = params.start_date;
						if (params.end_date) body.end_date = params.end_date;
						if (params.user_id) body.user_id = params.user_id;
						if (params.entity_id) body.entity_id = params.entity_id;
						if (params.event_filter) body.event_filter = params.event_filter;
						return client.v3("POST", `/workspaces/${team}/audit_logs`, body);
					}
					case "redetect_plan": {
						const planRes: any = await client.v2("GET", `/workspaces/${team}/plan`);
						const planId = String(planRes?.plan_id ?? planRes?.plan ?? "").toLowerCase();
						const plan: PlanTier = mapPlan(planId);
						const cfg = await loadConfig();
						if (cfg) {
							cfg.plan = plan;
							cfg.plan_detected_at = Date.now();
							await saveConfig(cfg);
						}
						return { plan, plan_id: planRes?.plan_id, effective_rate_limit_per_min: limitForPlan(plan) };
					}
				}
			});
			return result.ok ? okResult(result.data) : errResult(result.error);
		},
	});
}

function mapPlan(id: string): PlanTier {
	if (id.includes("free")) return "free";
	if (id.includes("unlimited") || id.includes("core")) return "unlimited";
	if (id.includes("business_plus") || id.includes("business plus")) return "business_plus";
	if (id.includes("business")) return "business";
	if (id.includes("enterprise_plus") || id.includes("enterprise plus")) return "enterprise_plus";
	if (id.includes("enterprise")) return "enterprise";
	return "unknown";
}
