/**
 * In-memory store for the latest session management snapshot.
 * The mobile client periodically POSTs its full session management state
 * so it can be retrieved by other clients (e.g. a web UI) via GET.
 */

const store = {
  snapshot: null,
  receivedAt: null,
};

export function registerSessionManagementStoreRoutes(app) {
  app.get("/api/session-management-store", (_, res) => {
    if (!store.snapshot) {
      return res.json({
        ok: false,
        reason: "no_snapshot",
        lastReceivedAt: store.receivedAt,
        snapshot: null,
      });
    }
    res.json({
      ok: true,
      lastReceivedAt: store.receivedAt,
      snapshot: store.snapshot,
    });
  });

  app.post("/api/session-management-store", (req, res) => {
    const snapshot = req.body;
    if (!snapshot || typeof snapshot !== "object") {
      return res.status(400).json({ ok: false, error: "Invalid payload" });
    }
    store.receivedAt = new Date().toISOString();
    store.snapshot = { ...snapshot, receivedAt: store.receivedAt };
    res.json({ ok: true });
  });
}
