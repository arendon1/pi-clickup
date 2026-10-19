/**
 * ClickUp API error taxonomy → actionable messages for the LLM.
 * Source: skill use-clickup references/error-handling.md (audited 2026-08-15)
 *         + RESEARCH.md §4.
 */

export interface ClickUpErrorPayload {
	error: true;
	code: string;
	http_status: number;
	message: string;
	ecode?: string;
	action_hint: string;
}

const REDACTED = "[REDACTED]";

/**
 * Redact the Authorization header value from any object before logging.
 * Used by debug logger in api.ts.
 */
export function redact<T>(obj: T): T {
	const seen = new WeakSet<object>();
	const walk = (v: any): any => {
		if (v === null || v === undefined) return v;
		if (typeof v === "string") {
			// crude redaction of pk_ tokens and Bearer tokens
			return v.replace(/pk_[A-Za-z0-9_]+/g, REDACTED).replace(/Bearer\s+[A-Za-z0-9_.-]+/g, `Bearer ${REDACTED}`);
		}
		if (Array.isArray(v)) return v.map(walk);
		if (typeof v === "object") {
			if (seen.has(v as object)) return v;
			seen.add(v as object);
			const out: Record<string, any> = {};
			for (const [k, val] of Object.entries(v as Record<string, any>)) {
				if (/authorization|token|api[_-]?key|pat/i.test(k)) {
					out[k] = REDACTED;
				} else {
					out[k] = walk(val);
				}
			}
			return out;
		}
		return v;
	};
	return walk(obj) as T;
}

interface ErrorResponseBody {
	err?: string;
	ECODE?: string;
	error_message?: string;
	msg?: string;
}

function buildError(httpStatus: number, body: unknown, ecode?: string): ClickUpErrorPayload {
	const b = (body || {}) as ErrorResponseBody;
	const apiMessage = b.err || b.error_message || b.msg || `HTTP ${httpStatus}`;
	const hint = hintFor(httpStatus, ecode, b);
	const code = ecode || codeFor(httpStatus);
	return {
		error: true,
		code,
		http_status: httpStatus,
		message: apiMessage,
		ecode,
		action_hint: hint,
	};
}

function codeFor(status: number): string {
	switch (status) {
		case 401:
			return "AUTH_INVALID";
		case 403:
			return "FORBIDDEN";
		case 404:
			return "NOT_FOUND";
		case 429:
			return "RATE_LIMITED";
		case 400:
			return "BAD_REQUEST";
		case 502:
		case 503:
		case 504:
			return "UPSTREAM_UNAVAILABLE";
		default:
			return status >= 500 ? "UPSTREAM_ERROR" : "API_ERROR";
	}
}

function hintFor(status: number, ecode?: string, body?: ErrorResponseBody): string {
	if (status === 401) {
		// 401 OAUTH_027/192 = nonexistent resource, NOT bad key
		if (ecode === "OAUTH_027" || ecode === "OAUTH_192") {
			return `Resource not found (${ecode}). Verify the id, or use clickup_lists.list / clickup_spaces.list to discover ids.`;
		}
		return "PAT invalid or revoked. Ask the user to run /clickup auth, or set CLICKUP_API_KEY.";
	}
	if (status === 403) {
		if (ecode === "TEAM_110") {
			return "Enterprise-only endpoint. This workspace plan does not support it.";
		}
		if (ecode === "FIELD_605") {
			return "Custom Field limit hit (Free: 60 accumulated uses per workspace). Re-create the PAT with a paid plan, or wait for quota reset.";
		}
		return "Insufficient permissions. The user may need broader workspace access, or this feature is not on their plan.";
	}
	if (status === 404) {
		return "Resource not found. Verify the id with a list call.";
	}
	if (status === 429) {
		const retry = body?.msg?.match(/(\d+)/)?.[1] || "60";
		return `Rate limited. Retry-After ${retry}s. We retried once automatically; the call still failed.`;
	}
	if (status === 400) {
		return `Bad request. Inspect the payload. ClickUp says: "${body?.err || body?.msg || "invalid"}".`;
	}
	if (status >= 500) {
		return "Upstream error. The tool retried 2× with backoff. Try again later.";
	}
	return "Unknown API error.";
}

/**
 * Build a ClickUp error from a fetch Response + body.
 * Caller passes the already-parsed JSON body (or text).
 */
export function errorFromResponse(status: number, bodyText: string): ClickUpErrorPayload {
	let body: ErrorResponseBody | undefined;
	try {
		body = JSON.parse(bodyText);
	} catch {
		body = undefined;
	}
	return buildError(status, body, body?.ECODE);
}

export class ClickUpError extends Error {
	readonly payload: ClickUpErrorPayload;
	constructor(payload: ClickUpErrorPayload) {
		super(payload.message);
		this.payload = payload;
		this.name = "ClickUpError";
	}
}
