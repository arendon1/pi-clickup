/**
 * ClickUp HTTP client.
 * - Header: Authorization: <pat>  (RAW, no Bearer — confirmed quirk)
 * - base v2 or v3
 * - timeout, retries, 429 retry, error taxonomy
 */

import { errorFromResponse, ClickUpError, redact } from "./errors.js";
import {
	acquire,
	recordFromHeaders,
	getRetryAfter,
	getLimitHeader,
	limitForPlan,
	newRateLimit,
	type RateLimitState,
} from "./rate-limit.js";
import { loadConfig, type PlanTier } from "./config.js";

const MAX_BODY_LOG = 4000;

export interface ApiClient {
	v2<T = unknown>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T>;
	v3<T = unknown>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T>;
	plan(): PlanTier;
	rateState(): RateLimitState;
}

export async function createApiClient(pat: string): Promise<ApiClient> {
	const cfg = await loadConfig();
	const plan: PlanTier = (cfg?.plan as PlanTier) ?? "free";
	const timeoutMs = cfg?.timeout_ms ?? 15000;
	const maxRetries = cfg?.max_retries ?? 2;
	const margin = cfg?.rate_limit_margin ?? 0.95;

	const state = newRateLimit(limitForPlan(plan), margin);

	async function call(
		base: string,
		method: string,
		path: string,
		body: unknown,
		signal: AbortSignal | undefined,
	): Promise<unknown> {
		// Wait for a rate-limit slot
		while (true) {
			const decision = acquire(state);
			if (decision.allowed) break;
			if (signal?.aborted) throw new Error("aborted");
			// signal-aware sleep
			await sleep(decision.waitMs, signal);
		}

		const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
		const headers: Record<string, string> = {
			Authorization: pat, // RAW, no Bearer
			"Content-Type": "application/json",
			Accept: "application/json",
		};

		const init: RequestInit = {
			method,
			headers,
			signal,
		};
		if (body !== undefined && body !== null) {
			init.body = JSON.stringify(body);
		}

		const debugEnabled = process.env.CLICKUP_PI_DEBUG === "1";

		const attemptOnce = async (): Promise<Response> => {
			const ctl = new AbortController();
			const timer = setTimeout(() => ctl.abort(new Error("timeout")), timeoutMs);
			const combined = signal
				? combineSignals([signal, ctl.signal])
				: ctl.signal;
			init.signal = combined;
			try {
				const res = await fetch(url, init);
				return res;
			} finally {
				clearTimeout(timer);
			}
		};

		let res: Response;
		let lastErr: unknown;
		let retried429 = false;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				res = await attemptOnce();
			} catch (err: any) {
				lastErr = err;
				if (signal?.aborted) throw new Error("aborted");
				if (attempt < maxRetries) {
					const backoff = jitter(500 * Math.pow(2, attempt));
					await sleep(backoff, signal);
					continue;
				}
				throw new ClickUpError({
					error: true,
					code: "NETWORK_ERROR",
					http_status: 0,
					message: err?.message || "Network error",
					action_hint: "Network error after retries. Check connectivity.",
				});
			}

			// record server-side rate limit headers
			recordFromHeaders(state, res.headers);

			// 429: respect Retry-After, auto-retry once
			if (res.status === 429) {
				const retry = getRetryAfter(res.headers);
				if (debugEnabled) console.error(`[clickup] 429; Retry-After ${retry}s`);
				if (!retried429) {
					retried429 = true;
					await sleep(retry * 1000, signal);
					continue;
				}
				// second 429 → surface error
				const text = await safeText(res);
				throw new ClickUpError(errorFromResponse(429, text));
			}

			// 5xx: retry with backoff
			if (res.status >= 500) {
				if (attempt < maxRetries) {
					const backoff = jitter(500 * Math.pow(2, attempt));
					await sleep(backoff, signal);
					continue;
				}
				const text = await safeText(res);
				throw new ClickUpError(errorFromResponse(res.status, text));
			}

			// Success
			if (res.status >= 200 && res.status < 300) {
				const text = await safeText(res);
				if (!text) return {};
				try {
					return JSON.parse(text);
				} catch {
					return { raw: text };
				}
			}

			// 4xx (non-429): terminal error
			const text = await safeText(res);
			if (debugEnabled) {
				console.error(
					`[clickup] ${method} ${path} → ${res.status}`,
					redact({ body: text.slice(0, MAX_BODY_LOG) }),
				);
			}
			throw new ClickUpError(errorFromResponse(res.status, text));
		}

		// Should be unreachable
		throw new ClickUpError(
			errorFromResponse(0, lastErr ? String(lastErr) : "exhausted retries"),
		);
	}

	return {
		async v2<T = unknown>(method, path, body, signal) {
			return (await call(cfg?.base_url_v2 || "https://api.clickup.com/api/v2", method, path, body, signal)) as T;
		},
		async v3<T = unknown>(method, path, body, signal) {
			return (await call(cfg?.base_url_v3 || "https://api.clickup.com/api/v3", method, path, body, signal)) as T;
		},
		plan: () => plan,
		rateState: () => state,
	};
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) return reject(new Error("aborted"));
		const t = setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(t);
				reject(new Error("aborted"));
			},
			{ once: true },
		);
	});
}

function jitter(ms: number): number {
	return ms * (0.75 + Math.random() * 0.5);
}

function combineSignals(signals: AbortSignal[]): AbortSignal {
	const ctl = new AbortController();
	for (const s of signals) {
		if (s.aborted) {
			ctl.abort(s.reason);
			break;
		}
		s.addEventListener("abort", () => ctl.abort(s.reason), { once: true });
	}
	return ctl.signal;
}

async function safeText(res: Response): Promise<string> {
	try {
		return await res.text();
	} catch {
		return "";
	}
}
