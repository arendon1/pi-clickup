/**
 * TUI dialogs for /clickup config, /clickup auth, /clickup status.
 * Uses ctx.ui primitives (input/select/confirm/notify). No custom components.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, maskPat, saveConfig, type ClickUpConfig } from "./config.js";
import { validatePat } from "./validate.js";

export async function cmdConfig(args: string, ctx: ExtensionContext): Promise<void> {
	if (ctx.mode !== "tui") {
		const cfg = await loadConfig();
		if (!cfg) {
			ctx.ui.notify("No config yet — run /clickup auth", "info");
			return;
		}
		ctx.ui.notify(
			`PAT: ${maskPat(cfg.pat)}  team: ${cfg.default_team_id ?? "(none)"}  plan: ${cfg.plan ?? "free"}  margin: ${cfg.rate_limit_margin}`,
			"info",
		);
		return;
	}
	const cfg = await loadConfig();
	if (!cfg) {
		ctx.ui.notify("No config yet — run /clickup auth", "warn");
		return;
	}
	const choice = await ctx.ui.select(`ClickUp config — PAT: ${maskPat(cfg.pat)} · team: ${cfg.default_team_id ?? "(none)"} · plan: ${cfg.plan ?? "free"} · margin ${cfg.rate_limit_margin}`, [
		"Change default workspace",
		"Change rate-limit margin",
		"Show full config",
		"Cancel",
	]);
	if (choice === "Change default workspace" && cfg.workspaces && cfg.workspaces.length > 0) {
		const next = await ctx.ui.select(
			"Pick default workspace",
			cfg.workspaces.map((w) => ({ label: `${w.name} (${w.id})`, value: w.id })),
		);
		if (next) {
			cfg.default_team_id = String(next);
			await saveConfig(cfg);
			ctx.ui.notify(`Default workspace set to ${next}`, "info");
		}
	} else if (choice === "Change rate-limit margin") {
		const input = await ctx.ui.input(`Rate-limit margin (current: ${cfg.rate_limit_margin})`, `${cfg.rate_limit_margin}`);
		const parsed = parseFloat(input || "");
		if (!Number.isNaN(parsed) && parsed > 0 && parsed < 1) {
			cfg.rate_limit_margin = parsed;
			await saveConfig(cfg);
			ctx.ui.notify(`Margin set to ${parsed}`, "info");
		} else {
			ctx.ui.notify("Invalid margin (must be 0 < m < 1)", "error");
		}
	} else if (choice === "Show full config") {
		ctx.ui.notify(JSON.stringify({ ...cfg, pat: maskPat(cfg.pat) }, null, 2), "info");
	}
}

export async function cmdAuth(args: string, ctx: ExtensionContext): Promise<void> {
	if (ctx.mode !== "tui") {
		ctx.ui.notify("/clickup auth requires interactive mode", "error");
		return;
	}
	const envPat = process.env.CLICKUP_API_KEY?.trim();
	let pat = envPat;
	if (!pat) {
		const input = await ctx.ui.input("Paste your ClickUp PAT (from 1Password):", "", "password");
		if (!input) {
			ctx.ui.notify("No PAT provided — aborting", "warn");
			return;
		}
		pat = input.trim();
	} else {
		const useEnv = await ctx.ui.confirm("Use CLICKUP_API_KEY from environment?", true);
		if (!useEnv) {
			const input = await ctx.ui.input("Paste your ClickUp PAT (from 1Password):", "", "password");
			pat = (input || "").trim();
		}
	}
	if (!pat) {
		ctx.ui.notify("No PAT provided — aborting", "warn");
		return;
	}

	ctx.ui.notify("Validating PAT…", "info");
	const result = await validatePat(pat);
	if (!result.ok) {
		ctx.ui.notify(`Auth failed: ${result.error}`, "error");
		return;
	}

	if (!result.workspaces || result.workspaces.length === 0) {
		ctx.ui.notify("PAT valid, but no workspaces found", "warn");
		return;
	}

	const choice = await ctx.ui.select(
		`Pick default workspace (detected plan: ${result.plan})`,
		result.workspaces.map((w) => ({
			label: `${w.name} (${w.id})${w.role ? ` — role ${w.role}` : ""}`,
			value: w.id,
		})),
	);
	if (choice) {
		const cfg = (await loadConfig()) || ({} as ClickUpConfig);
		cfg.pat = pat;
		cfg.default_team_id = String(choice);
		cfg.plan = result.plan;
		cfg.plan_detected_at = Date.now();
		await saveConfig(cfg);
		ctx.ui.notify(
			`Saved config — workspace ${choice} (plan: ${result.plan}, source: ${result.plan_source})`,
			"info",
		);
	}
}

export async function cmdStatus(args: string, ctx: ExtensionContext): Promise<void> {
	const cfg = await loadConfig();
	if (!cfg) {
		ctx.ui.notify("No config — run /clickup auth", "warn");
		return;
	}
	const lines = [
		`PAT: ${maskPat(cfg.pat)}`,
		`Default workspace: ${cfg.default_team_id ?? "(none)"}`,
		`Plan: ${cfg.plan ?? "free"}${cfg.plan_detected_at ? ` (detected ${new Date(cfg.plan_detected_at).toLocaleString()})` : ""}`,
		`Base v2: ${cfg.base_url_v2}`,
		`Base v3: ${cfg.base_url_v3}`,
		`Timeout: ${cfg.timeout_ms}ms · Retries: ${cfg.max_retries} · Margin: ${cfg.rate_limit_margin}`,
	];
	if (cfg.workspaces && cfg.workspaces.length > 0) {
		lines.push(`Workspaces (${cfg.workspaces.length}): ${cfg.workspaces.map((w) => w.name).join(", ")}`);
	}
	ctx.ui.notify(lines.join("\n"), "info");
}
