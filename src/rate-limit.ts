/**
 * Sliding-window rate limiter.
 * - 100 req/min by default, scaled up by plan tier.
 * - Per-token, in-memory.
 * - Capped by Retry-After on 429, with 1 auto-retry.
 * - ClickUp is shared per token across devices → headers are the source of truth.
 */

export interface RateLimitState {
	timestamps: number[]; // ms epoch
	limit: number;        // per minute
	margin: number;       // 0..1, e.g. 0.95
	server_remaining?: number;
	server_reset?: number; // ms epoch
}

export interface RateLimitDecision {
	allowed: boolean;
	waitMs: number;
	state: RateLimitState;
}

const WINDOW_MS = 60_000;

export function newRateLimit(limit: number, margin: number): RateLimitState {
	return {
		timestamps: [],
		limit: Math.max(1, Math.floor(limit * margin)),
		margin,
	};
}

/** Tier → req/min. Source: docs/rate-limits.md via RESEARCH.md §5. */
export function limitForPlan(plan: string | undefined): number {
	switch (plan) {
		case "free":
		case "unlimited":
		case "business":
			return 100;
		case "business_plus":
			return 1000;
		case "enterprise":
		case "enterprise_plus":
			return 10000;
		default:
			return 100;
	}
}

function prune(state: RateLimitState, now: number): void {
	const cutoff = now - WINDOW_MS;
	while (state.timestamps.length > 0 && state.timestamps[0] < cutoff) {
		state.timestamps.shift();
	}
}

/**
 * Decide whether a new request can be issued.
 * If not allowed, return how long to wait for the oldest slot to expire.
 */
export function acquire(state: RateLimitState, now: number = Date.now()): RateLimitDecision {
	prune(state, now);
	if (state.timestamps.length < state.limit) {
		state.timestamps.push(now);
		return { allowed: true, waitMs: 0, state };
	}
	const oldest = state.timestamps[0];
	const waitMs = Math.max(0, WINDOW_MS - (now - oldest));
	return { allowed: false, waitMs, state };
}

export function recordFromHeaders(state: RateLimitState, headers: Headers, now: number = Date.now()): void {
	const remaining = headers.get("x-ratelimit-remaining");
	const reset = headers.get("x-ratelimit-reset");
	if (remaining != null) {
		const r = parseInt(remaining, 10);
		if (!Number.isNaN(r)) state.server_remaining = r;
	}
	if (reset != null) {
		// ClickUp sends unix seconds (heuristic — some send ms; we use seconds if < 10^12)
		const raw = parseInt(reset, 10);
		if (!Number.isNaN(raw)) {
			state.server_reset = raw < 1e12 ? raw * 1000 : raw;
		}
	}
	// If server says remaining < 0, force the local window to full
	if (state.server_remaining !== undefined && state.server_remaining <= 0 && state.timestamps.length < state.limit) {
		// backfill to push next window out
		const synthetic = (state.server_reset ?? now) - WINDOW_MS;
		state.timestamps.push(synthetic);
	}
}

export function getRetryAfter(headers: Headers): number {
	const h = headers.get("retry-after");
	if (!h) return 60;
	const n = parseInt(h, 10);
	return Number.isNaN(n) ? 60 : Math.min(120, Math.max(1, n));
}

export function getLimitHeader(headers: Headers): number | undefined {
	const h = headers.get("x-ratelimit-limit");
	if (!h) return undefined;
	const n = parseInt(h, 10);
	return Number.isNaN(n) ? undefined : n;
}
