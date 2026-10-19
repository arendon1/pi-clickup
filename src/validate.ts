/**
 * PAT validation: ping /v2/user and /v2/team.
 * Detects de-facto "scope" (user role + workspace plan).
 */

import { createApiClient, type ApiClient } from "./api.js";
import { saveConfig, type PlanTier, type ClickUpConfig } from "./config.js";

export interface ValidationResult {
	ok: boolean;
	user?: { id: number; username: string; email: string };
	workspaces?: Array<{ id: string; name: string; members_count?: number; color?: string; role?: string }>;
	plan?: PlanTier;
	plan_source?: "workspaces_plan" | "fallback";
	error?: string;
}

export async function validatePat(pat: string, explicitTeamId?: string): Promise<ValidationResult> {
	let client: ApiClient;
	try {
		client = await createApiClient(pat);
	} catch (err: any) {
		return { ok: false, error: err?.message || "Failed to create client" };
	}

	let user: any;
	try {
		user = await client.v2("GET", "/user");
	} catch (err: any) {
		return { ok: false, error: `whoami failed: ${err?.payload?.message || err?.message || "unknown"}` };
	}

	let teams: any;
	try {
		teams = await client.v2("GET", "/team");
	} catch (err: any) {
		return { ok: false, error: `teams failed: ${err?.payload?.message || err?.message || "unknown"}` };
	}

	const workspaces: ValidationResult["workspaces"] = (teams.teams || []).map((t: any) => ({
		id: String(t.id),
		name: t.name,
		members_count: t.members?.length,
		color: t.color,
		role: t.role,
	}));

	const targetTeam = explicitTeamId
		? workspaces?.find((w) => w.id === explicitTeamId)
		: workspaces?.[0];

	let plan: PlanTier = "free";
	let planSource: "workspaces_plan" | "fallback" = "fallback";
	if (targetTeam) {
		try {
			const planRes: any = await client.v2("GET", `/workspaces/${targetTeam.id}/plan`);
			// ClickUp plan API returns e.g. { team_id, plan_id, plan_name, ... }
			const planId = String(planRes?.plan_id ?? planRes?.plan ?? "").toLowerCase();
			plan = mapPlanId(planId);
			planSource = "workspaces_plan";
		} catch {
			plan = "free";
			planSource = "fallback";
		}
	}

	// Persist the detected plan
	const cfg = await loadConfigSafe();
	cfg.pat = pat;
	cfg.default_team_id = targetTeam?.id;
	cfg.plan = plan;
	cfg.plan_detected_at = Date.now();
	await saveConfig(cfg);

	return {
		ok: true,
		user: {
			id: user.user?.id,
			username: user.user?.username,
			email: user.user?.email,
		},
		workspaces,
		plan,
		plan_source: planSource,
	};
}

function mapPlanId(id: string): PlanTier {
	if (id.includes("free")) return "free";
	if (id.includes("unlimited") || id.includes("core")) return "unlimited";
	if (id.includes("business_plus") || id.includes("business plus")) return "business_plus";
	if (id.includes("business")) return "business";
	if (id.includes("enterprise_plus") || id.includes("enterprise plus")) return "enterprise_plus";
	if (id.includes("enterprise")) return "enterprise";
	return "unknown";
}

async function loadConfigSafe(): Promise<ClickUpConfig> {
	const { loadConfig, DEFAULT_CONFIG_BASE } = await import("./config.js");
	const cfg = await loadConfig();
	return (cfg || { pat: "", ...DEFAULT_CONFIG_BASE }) as ClickUpConfig;
}
