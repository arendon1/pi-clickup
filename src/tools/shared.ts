/**
 * Shared helpers for tools: TypeBox schemas, result shaping, common params.
 */

import { Type } from "typebox";
import type { ApiClient } from "../api.js";
import { ClickUpError } from "../errors.js";

export const StringEnum = <const T extends readonly string[]>(values: T) =>
	Type.Unsafe<T[number]>({
		type: "string",
		enum: [...values],
	});

/** Common id params. */
export const IdParam = (description: string) =>
	Type.String({ description, pattern: "^[0-9]+$" });

export const PaginationParams = Type.Object({
	page: Type.Optional(Type.Number({ description: "Page number (0-indexed)", minimum: 0 })),
	limit: Type.Optional(Type.Number({ description: "Page size", minimum: 1, maximum: 100, default: 100 })),
});

/** Standard "team-scoped" params: most v2 endpoints take team_id (workspace). */
export const TeamParams = Type.Object({
	team_id: Type.Optional(IdParam("Workspace (team) id — defaults to config.default_team_id")),
});

/**
 * Run an action and convert thrown ClickUpError into a structured tool result.
 * Tools return { content: [{ type: "text", text: JSON.stringify(error) }], details: ... }
 * so the LLM gets a clean actionable message.
 */
export async function safeExecute<T>(fn: () => Promise<T>): Promise<
	| { ok: true; data: T }
	| { ok: false; error: any }
> {
	try {
		const data = await fn();
		return { ok: true, data };
	} catch (err: any) {
		if (err instanceof ClickUpError) {
			return { ok: false, error: err.payload };
		}
		return {
			ok: false,
			error: {
				error: true,
				code: "INTERNAL",
				http_status: 0,
				message: err?.message || "Unknown error",
				action_hint: "Inspect stack trace / re-run with CLICKUP_PI_DEBUG=1",
			},
		};
	}
}

/** Shape a successful result as the LLM expects from pi. */
export function okResult<T>(data: T) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
		details: data,
	};
}

/** Shape a failed result. */
export function errResult(error: any) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(error, null, 2) }],
		details: { error: true, ...error },
	};
}

/** Resolve a client (assumes ctx-provided via closure). */
export function makeClient(pat: string): Promise<ApiClient> {
	// dynamic import to avoid loading config at module init time
	return import("../api.js").then((m) => m.createApiClient(pat));
}
