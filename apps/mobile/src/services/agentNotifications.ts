/**
 * Agent notifications - local notifications when the AI agent finishes
 * or needs user approval (human-in-the-loop).
 *
 * Shows notifications when:
 * - Agent finishes its final response
 * - Agent needs user approval (e.g. tool execution, confirm/select dialogs)
 *
 * Note: expo-notifications is not fully supported in Expo Go. We lazy-load it
 * only in dev/preview builds to avoid the warning; in Expo Go we use haptics only.
 */
import { triggerHaptic } from "@/designSystem";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

const AGENT_CHANNEL_ID = "agent-events";

/** True when running in Expo Go (notifications unavailable, use haptics only). */
const isExpoGo =
  Constants.appOwnership === "expo" || Constants.executionEnvironment === "storeClient";

let permissionsEnsured = false;
let notificationHandlerSet = false;

async function getNotifications() {
  return import("expo-notifications");
}

/** Ensure notification permissions and Android channel. Call once on app init. */
export async function ensureNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web" || isExpoGo) return false;
  if (permissionsEnsured) return true;

  try {
    const Notifications = await getNotifications();

    if (!notificationHandlerSet) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      notificationHandlerSet = true;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(AGENT_CHANNEL_ID, {
        name: "Agent Events",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        enableVibrate: true,
      });
    }

    if (!Device.isDevice) return false;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    permissionsEnsured = finalStatus === "granted";
    return permissionsEnsured;
  } catch {
    return false;
  }
}

/** Schedule an immediate local notification. */
async function scheduleNotification(title: string, body: string): Promise<void> {
  if (Platform.OS === "web" || isExpoGo) return;
  const granted = await ensureNotificationPermissions();
  if (!granted) return;

  try {
    const Notifications = await getNotifications();
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {},
      },
      trigger: null,
    });
  } catch (e) {
    console.warn("[agentNotifications] Failed to schedule:", e);
  }
}

/**
 * Notify when the agent has finished its final response.
 * Triggers haptic (foreground) and local notification (works when app backgrounded).
 */
export async function notifyAgentFinished(): Promise<void> {
  triggerHaptic("success");
  await scheduleNotification(
    "Agent finished",
    "The AI agent has completed its response."
  );
}

/**
 * Notify when the agent needs user approval (human-in-the-loop).
 * Triggers haptic (foreground) and local notification.
 */
export async function notifyApprovalNeeded(title?: string): Promise<void> {
  triggerHaptic("warning");
  await scheduleNotification(
    "Approval needed",
    title ?? "The AI agent is waiting for your approval to continue."
  );
}
