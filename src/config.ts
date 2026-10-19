/**
 * ClickUp config: load/save, env override, chmod 600.
 * Resolution order (highest priority first):
 *   1. process.env.CLICKUP_API_KEY
 *   2. process.env.CLICKUP_TEAM
 *   3. ~/.config/clickup-pi/config.json
 *   4. Error: ask the user to run /clickup auth
 */

import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export type PlanTier = "free" | "unlimited" | "business" | "business_plus" | "enterprise" | "unknown";

export interface ClickUpConfig {
	pat: string;
	default_team_id?: string;
	base_url_v2: string;
	base_url_v3: string;
	timeout_ms: number;
	max_retries: number;
	rate_limit_margin: number;
	/** Detected at runtime by /clickup auth. */
	plan?: PlanTier;
	plan_detected_at?: number;
}

const DEFAULT_CONFIG: Omit<ClickUpConfig, "pat"> = {
	base_url_v2: "https://api.clickup.com/api/v2",
	base_url_v3: "https://api.clickup.com/api/v3",
	timeout_ms: 15000,
	max_retries: 2,
	rate_limit_margin: 0.95,
};

export const CONFIG_DIR = join(homedir(), ".config", "clickup-pi");
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export function getConfigPath(): string {
	return CONFIG_PATH;
}

export async function loadConfig(): Promise<ClickUpConfig | null> {
	if (!existsSync(CONFIG_PATH)) return null;
	try {
		const raw = await readFile(CONFIG_PATH, "utf8");
		const parsed = JSON.parse(raw) as Partial<ClickUpConfig>;
		return { ...DEFAULT_CONFIG, ...parsed } as ClickUpConfig;
	} catch {
		return null;
	}
}

export async function saveConfig(config: ClickUpConfig): Promise<void> {
	await mkdir(CONFIG_DIR, { recursive: true });
	await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
	await chmod(CONFIG_PATH, 0o600);
}

/**
 * Resolve the effective PAT and team at runtime.
 * Returns the env-overridden values if present, else the config file values.
 */
export async function resolveCredentials(): Promise<{
	pat: string;
	team_id?: string;
	source: "env" | "config" | "missing";
}> {
	const envPat = process.env.CLICKUP_API_KEY?.trim();
	const envTeam = process.env.CLICKUP_TEAM?.trim();
	if (envPat) {
		return { pat: envPat, team_id: envTeam, source: "env" };
	}
	const cfg = await loadConfig();
	if (cfg?.pat) {
		return { pat: cfg.pat, team_id: envTeam || cfg.default_team_id, source: "config" };
	}
	return { pat: "", source: "missing" };
}

export function maskPat(pat: string): string {
	if (!pat) return "(none)";
	if (pat.length <= 8) return "***";
	return `${pat.slice(0, 4)}…${pat.slice(-4)}`;
}

export const DEFAULT_CONFIG_BASE = DEFAULT_CONFIG;
