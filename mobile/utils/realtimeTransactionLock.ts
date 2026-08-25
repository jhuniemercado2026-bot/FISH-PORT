import { getApiBaseUrl } from "../api/axios";
import type { TransactionLockState } from "../store/historyStore";

type TransactionLockPayload = {
  transaction_lock?: TransactionLockState | null;
};

type RealtimeOptions = {
  onUpdate: (transactionLock: TransactionLockState | null, payload: TransactionLockPayload) => void;
};

const DEFAULT_REVERB_APP_KEY = "tjcu6zpw8pmx5epf8g1g";
const TRANSACTION_LOCK_CHANNEL = "transaction-lock";

const parseEventData = (data: unknown) => {
  if (typeof data !== "string") return data;

  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};

const getApiHost = () => {
  try {
    return new URL(getApiBaseUrl()).hostname;
  } catch {
    return "localhost";
  }
};

const buildReverbUrl = () => {
  const appKey =
    process.env.EXPO_PUBLIC_REVERB_APP_KEY?.trim() || DEFAULT_REVERB_APP_KEY;
  const scheme =
    process.env.EXPO_PUBLIC_REVERB_SCHEME?.trim() ||
    (getApiBaseUrl().startsWith("https://") ? "https" : "http");
  const host = process.env.EXPO_PUBLIC_REVERB_HOST?.trim() || getApiHost();
  const port = process.env.EXPO_PUBLIC_REVERB_PORT?.trim() || "8080";
  const wsScheme = scheme === "https" ? "wss" : "ws";

  return `${wsScheme}://${host}:${port}/app/${appKey}?protocol=7&client=react-native&version=1.0.0&flash=false`;
};

export function startTransactionLockRealtime({ onUpdate }: RealtimeOptions) {
  const enabled =
    String(process.env.EXPO_PUBLIC_REALTIME_ENABLED ?? "true").toLowerCase() !==
    "false";

  if (!enabled) {
    return () => {};
  }

  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closedByCaller = false;

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (closedByCaller || reconnectTimer) return;

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 3000);
  };

  const subscribe = () => {
    socket?.send(
      JSON.stringify({
        event: "pusher:subscribe",
        data: {
          channel: TRANSACTION_LOCK_CHANNEL,
        },
      })
    );
  };

  const connect = () => {
    if (closedByCaller) return;

    try {
      socket = new WebSocket(buildReverbUrl());
    } catch {
      scheduleReconnect();
      return;
    }

    socket.onopen = subscribe;

    socket.onmessage = (message) => {
      const payload = parseEventData(message.data);
      if (!payload || typeof payload !== "object") return;

      const event = String((payload as { event?: string }).event ?? "");
      if (event.startsWith("pusher:")) return;

      const channel = String((payload as { channel?: string }).channel ?? "");
      if (channel && channel !== TRANSACTION_LOCK_CHANNEL) return;

      if (event !== "updated" && event !== ".updated") return;

      const data = parseEventData((payload as { data?: unknown }).data);
      if (!data || typeof data !== "object") return;

      const lockPayload = data as TransactionLockPayload;
      onUpdate(lockPayload.transaction_lock ?? null, lockPayload);
    };

    socket.onerror = () => {
      socket?.close();
    };

    socket.onclose = scheduleReconnect;
  };

  connect();

  return () => {
    closedByCaller = true;
    clearReconnectTimer();
    socket?.close();
    socket = null;
  };
}
