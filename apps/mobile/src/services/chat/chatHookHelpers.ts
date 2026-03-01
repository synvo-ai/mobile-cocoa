export const resolveDefaultModel = (provider: string): string => {
  if (provider === "claude") return "sonnet4.5";
  if (provider === "codex") return "gpt-5.1-codex-mini";
  return "gemini-3.1-flash";
};

export const resolveStreamUrl = (
  serverUrl: string,
  sessionId: string,
  skipReplayForSession: string | null
): { url: string; applySkipReplay: boolean } => {
  let streamUrl = `${serverUrl}/api/sessions/${sessionId}/stream?activeOnly=1`;
  return {
    url: skipReplayForSession === sessionId ? `${streamUrl}&skipReplay=1` : streamUrl,
    applySkipReplay: skipReplayForSession === sessionId,
  };
};
