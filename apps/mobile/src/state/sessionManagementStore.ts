import { create } from "zustand";
import { getFallbackDefaultModelForProvider } from "@/services/server/modelsApi";

export type SessionStatus = {
  id: string;
  cwd: string | null;
  model: string | null;
  lastAccess: number;
  status: "running" | "idling";
  waitingForPermission?: boolean;
  title: string;
};

export type ProviderName = string;

export type SessionManagementStore = {
  sessionStatuses: SessionStatus[];
  sessionId: string | null;
  provider: ProviderName;
  model: string;
  setSessionStatuses: (sessions: SessionStatus[]) => void;
  setSessionId: (sessionId: string | null) => void;
  setProvider: (provider: ProviderName) => void;
  setModel: (model: string) => void;
  upsertSessionStatus: (session: SessionStatus) => void;
  removeSessionStatus: (sessionId: string) => void;
  clearSessionStatuses: () => void;
};

const normalizeSessionStatus = (status: unknown): SessionStatus["status"] =>
  status === "running" ? "running" : "idling";

const normalizeSession = (session: SessionStatus): SessionStatus => ({
  ...session,
  status: normalizeSessionStatus(session.status),
  waitingForPermission: session.waitingForPermission === true,
});

const areSessionStatusesEqual = (a: SessionStatus[], b: SessionStatus[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (
      left.id !== right.id ||
      left.cwd !== right.cwd ||
      left.model !== right.model ||
      left.lastAccess !== right.lastAccess ||
      left.status !== right.status ||
      (left.waitingForPermission ?? false) !== (right.waitingForPermission ?? false) ||
      left.title !== right.title
    ) {
      return false;
    }
  }
  return true;
};

export const useSessionManagementStore = create<SessionManagementStore>((set) => ({
  sessionStatuses: [],
  sessionId: null,
  provider: "codex",
  model: getFallbackDefaultModelForProvider("codex"),
  setSessionStatuses: (sessions) =>
    set((state) => {
      const normalized = sessions.map(normalizeSession);
      return areSessionStatusesEqual(state.sessionStatuses, normalized) ? state : { sessionStatuses: normalized };
    }),
  setSessionId: (sessionId) => set((state) => (state.sessionId === sessionId ? state : { sessionId })),
  setProvider: (provider) => set((state) => (state.provider === provider ? state : { provider })),
  setModel: (model) => set((state) => (state.model === model ? state : { model })),
  upsertSessionStatus: (session) =>
    set((state) => {
      const normalized = normalizeSession(session);
      const next = state.sessionStatuses.filter((s) => s.id !== normalized.id);
      return { sessionStatuses: [normalized, ...next] };
    }),
  removeSessionStatus: (sessionId) =>
    set((state) => ({
      sessionStatuses: state.sessionStatuses.filter((s) => s.id !== sessionId),
    })),
  clearSessionStatuses: () => set({ sessionStatuses: [] }),
}));

export const isSessionRunning = (session: SessionStatus): boolean =>
  session.status === "running";
