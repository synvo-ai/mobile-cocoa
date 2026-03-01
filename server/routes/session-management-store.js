let latestSessionManagementSnapshot = null;
let latestSessionManagementSnapshotReceivedAt = null;

export function registerSessionManagementStoreRoutes(app) {
  app.get("/api/session-management-store", (_, res) => {
    if (!latestSessionManagementSnapshot) {
      return res.json({
        ok: false,
        reason: "no_snapshot",
        lastReceivedAt: latestSessionManagementSnapshotReceivedAt,
        snapshot: null,
      });
    }
    res.json({
      ok: true,
      lastReceivedAt: latestSessionManagementSnapshotReceivedAt,
      snapshot: latestSessionManagementSnapshot,
    });
  });

  app.post("/api/session-management-store", (req, res) => {
    const snapshot = req.body;
    if (!snapshot || typeof snapshot !== "object") {
      return res.status(400).json({ ok: false, error: "Invalid payload" });
    }
    latestSessionManagementSnapshotReceivedAt = new Date().toISOString();
    latestSessionManagementSnapshot = {
      ...snapshot,
      receivedAt: latestSessionManagementSnapshotReceivedAt,
    };
    res.json({ ok: true });
  });
}
