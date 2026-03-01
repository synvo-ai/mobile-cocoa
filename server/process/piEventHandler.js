/**
 * Pi RPC event handling utilities.
 * Handles event parsing, transformation, and forwarding.
 * Extracted from piRpcSession.js for better maintainability.
 */
import { SLIM_EVENT_THRESHOLD_BYTES } from "../config/constants.js";

/**
 * Parse AskUserQuestion answers from input data.
 *
 * @param {string} raw - Raw input string
 * @returns {Array | null} Parsed answers array or null
 */
export function parseAskQuestionAnswersFromInput(raw) {
    if (typeof raw !== "string" || !raw.trim()) return null;
    try {
        const top = JSON.parse(raw);
        const content = top?.message?.content;
        if (!Array.isArray(content) || content.length === 0) return null;
        const first = content[0];
        const inner = typeof first?.content === "string" ? first.content : null;
        if (!inner) return null;
        const parsed = JSON.parse(inner);
        return Array.isArray(parsed) ? parsed : null;
    } catch (_) {
        return null;
    }
}

/**
 * Decide approval based on user answers.
 *
 * @param {Array | null} answers - Parsed answers
 * @param {string} fallbackRaw - Fallback raw input
 * @returns {boolean} True if approved
 */
export function decideApprovalFromAnswers(answers, fallbackRaw) {
    const selected = Array.isArray(answers)
        ? answers.flatMap((a) => (Array.isArray(a?.selected) ? a.selected : []))
        : [];
    const normalized = selected.map((optionText) => String(optionText).trim().toLowerCase());
    const hasAccept = normalized.some((optionText) => /approve|accept|allow|run/.test(optionText));
    const hasDeny = normalized.some((optionText) => /deny|decline|reject|cancel|block/.test(optionText));
    if (hasAccept && !hasDeny) return true;
    if (hasDeny && !hasAccept) return false;
    const fallbackText = typeof fallbackRaw === "string" ? fallbackRaw.trim().toLowerCase() : "";
    if (["y", "yes", "approve", "accept", "allow", "run"].includes(fallbackText)) return true;
    if (["n", "no", "deny", "decline", "reject", "cancel", "block"].includes(fallbackText)) return false;
    return false;
}

/**
 * Transform Pi extension_ui_request to AskUserQuestion format for client modal.
 *
 * @param {object} request - Extension UI request
 * @returns {object} AskUserQuestion payload
 */
export function toAskUserQuestionPayload(request) {
    const id = request.id;
    const title = request.title ?? "Approval";
    const message = request.message ?? title;
    const options = request.options ?? ["Allow", "Deny"];

    const questions = [
        {
            header: String(title),
            question: String(message),
            options: options.map((o) => ({
                label: typeof o === "string" ? o : String(o?.label ?? o),
                description: typeof o === "object" && o != null ? o.description : undefined,
            })),
            multiSelect: false,
        },
    ];

    return {
        tool_name: "AskUserQuestion",
        tool_use_id: id,
        uuid: id,
        tool_input: { questions },
    };
}

/**
 * Strip heavy content from snapshot/lifecycle events before forwarding to SSE clients.
 * Events like message_end, turn_end, agent_end carry the full message content (60KB+)
 * but the mobile client treats them as no-ops. Sending slim versions prevents
 * xhr.responseText from growing unboundedly, which causes RangeError in Hermes.
 *
 * @param {object} parsed - Parsed event object
 * @returns {object} Slimmed event object
 */
export function slimEventForSse(parsed) {
    const type = String(parsed.type ?? "");
    // These event types carry full message/content snapshots that the client ignores
    const HEAVY_TYPES = new Set(["message_end", "turn_end", "message_start"]);
    if (HEAVY_TYPES.has(type)) {
        return { type };
    }
    // agent_end carries all conversation messages — strip to just type
    if (type === "agent_end") {
        return { type: "agent_end" };
    }
    // message events with role: assistant may contain full content — strip if > threshold
    if (type === "message" && parsed.message?.role === "assistant") {
        const serialized = JSON.stringify(parsed);
        if (serialized.length > SLIM_EVENT_THRESHOLD_BYTES) {
            return {
                type: "message",
                id: parsed.id,
                parentId: parsed.parentId,
                timestamp: parsed.timestamp,
                message: { role: "assistant", content: "[content stripped for SSE]" },
            };
        }
    }
    // message_update: client only needs assistantMessageEvent.type, contentIndex, delta/content.
    // Pi can send full accumulated content; slimming prevents unbounded xhr.responseText growth.
    if (type === "message_update") {
        const assistantMessageEvent = parsed.assistantMessageEvent ?? {};
        return {
            type: "message_update",
            assistantMessageEvent: {
                type: assistantMessageEvent.type,
                contentIndex: assistantMessageEvent.contentIndex,
                delta: assistantMessageEvent.delta ?? assistantMessageEvent.content,
                ...(assistantMessageEvent.toolCall != null ? { toolCall: assistantMessageEvent.toolCall } : {}),
            },
        };
    }
    return parsed;
}
