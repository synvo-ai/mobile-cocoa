import type { Message, PermissionDenial } from "@/core/types";

export const deduplicateMessageIds = (messages: Message[], nextIdRef: { current: number }): Message[] => {
  const seen = new Set<string>();
  return messages.map((message) => {
    let id = message.id;
    if (seen.has(id)) {
      id = `msg-${++nextIdRef.current}`;
      seen.add(id);
    } else {
      seen.add(id);
    }
    return id === message.id ? message : { ...message, id };
  });
};

export const deduplicateDenials = (denials: PermissionDenial[]): PermissionDenial[] => {
  const seen = new Set<string>();
  return denials.filter((denial) => {
    const tool = denial.tool_name ?? denial.tool ?? "?";
    const pathKey = denial.tool_input?.file_path ?? denial.tool_input?.path ?? "";
    const key = `${tool}:${pathKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const getMaxMessageId = (messages: Message[]): number => {
  let maxN = 0;
  for (const message of messages) {
    const match = /^msg-(\d+)$/.exec(message.id);
    if (match) maxN = Math.max(maxN, parseInt(match[1], 10));
  }
  return maxN;
};

export const appendCodeRefsToPrompt = (
  prompt: string,
  codeRefs?: Array<{ path: string; snippet: string }>,
): string => {
  if (!codeRefs || codeRefs.length === 0) {
    return prompt;
  }
  const refsText = codeRefs
    .map((ref) => `File: ${ref.path}\n\`\`\`\n${ref.snippet}\n\`\`\``)
    .join("\n\n");
  return `${refsText}\n\n${prompt}`;
};
