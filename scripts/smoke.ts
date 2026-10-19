/**
 * Smoke test: hits a few key endpoints end-to-end.
 * Requires CLICKUP_API_KEY env (or a config at ~/.config/clickup-pi/config.json).
 *
 * Run:  npm run smoke   (or)   node --experimental-strip-types scripts/smoke.ts
 */

import { resolveCredentials, loadConfig, maskPat } from "../src/config.js";
import { createApiClient } from "../src/api.js";

async function main() {
	const creds = await resolveCredentials();
	if (!creds.pat) {
		console.error("No ClickUp PAT. Set CLICKUP_API_KEY env or run /clickup auth in pi TUI.");
		process.exit(2);
	}
	console.log(`PAT: ${maskPat(creds.pat)}  source: ${creds.source}  team: ${creds.team_id ?? "(none)"}`);
	const cfg = await loadConfig();
	console.log(`Plan: ${cfg?.plan ?? "free"}  margin: ${cfg?.rate_limit_margin}`);

	const client = await createApiClient(creds.pat);

	const checks: Array<[string, () => Promise<unknown>]> = [
		["whoami /v2/user", () => client.v2("GET", "/user")],
		["workspaces /v2/team", () => client.v2("GET", "/team")],
	];
	if (creds.team_id) {
		checks.push([`spaces /v2/team/${creds.team_id}/space`, () => client.v2("GET", `/team/${creds.team_id}/space`)]);
		checks.push([`plan /v2/workspaces/${creds.team_id}/plan`, () => client.v2("GET", `/workspaces/${creds.team_id}/plan`)]);
	}

	let ok = 0, fail = 0;
	for (const [name, fn] of checks) {
		try {
			const res = await fn();
			const count = Array.isArray(res) ? res.length : (res && typeof res === "object" ? Object.keys(res).length : 1);
			console.log(`  ✓ ${name}  (${count} keys/rows)`);
			ok++;
		} catch (err: any) {
			console.error(`  ✗ ${name}  → ${err?.payload?.code || err?.message}`);
			fail++;
		}
	}
	console.log(`\n${ok} passed, ${fail} failed`);
	if (fail > 0) process.exit(1);
}

main().catch((err) => {
	console.error("Fatal:", err);
	process.exit(1);
});
