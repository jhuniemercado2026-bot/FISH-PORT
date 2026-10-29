type TransactionUpdatePayload = {
  type?: string;
  action?: string;
  record?: Record<string, any>;
};

type RealtimeOptions = {
  onTransactionUpdate?: (record: Record<string, any>, payload: TransactionUpdatePayload) => void;
  onCollectionUpdate?: (record: Record<string, any>, payload: TransactionUpdatePayload) => void;
  onSubscribed?: () => void;
  onRemittanceUpdate: (record: Record<string, any>, payload: TransactionUpdatePayload) => void;
};

const TRANSACTIONS_CHANNEL = "transactions";

const parseEventData = (data: unknown) => {
  if (typeof data !== "string") return data;

  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};

const buildPusherUrl = () => {
  const appKey = process.env.EXPO_PUBLIC_PUSHER_APP_KEY?.trim();
  const scheme =
    process.env.EXPO_PUBLIC_PUSHER_SCHEME?.trim() || "https";
  const cluster =
    process.env.EXPO_PUBLIC_PUSHER_APP_CLUSTER?.trim() || "mt1";
  const host =
    process.env.EXPO_PUBLIC_PUSHER_HOST?.trim() || `ws-${cluster}.pusher.com`;
  const port = process.env.EXPO_PUBLIC_PUSHER_PORT?.trim();
  const wsScheme = scheme === "https" ? "wss" : "ws";

  if (!appKey) return null;

  const portSegment = port ? `:${port}` : "";
  return `${wsScheme}://${host}${portSegment}/app/${appKey}?protocol=7&client=react-native&version=1.0.0&flash=false`;
};

export function startTransactionsRealtime({ onRemittanceUpdate, onTransactionUpdate, onCollectionUpdate, onSubscribed }: RealtimeOptions) {
  const enabled =
    String(process.env.EXPO_PUBLIC_REALTIME_ENABLED ?? "true").toLowerCase() !==
    "false";

  if (!enabled) {
    return () => {};
  }

  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closedByCaller = false;
  let activityTimer: ReturnType<typeof setTimeout> | null = null;
  let activityTimeout = 120000;

  const clearActivityTimer = () => {
    if (activityTimer) clearTimeout(activityTimer);
    activityTimer = null;
  };

  const resetActivityTimer = () => {
    clearActivityTimer();
    activityTimer = setTimeout(() => {
      socket?.send(JSON.stringify({ event: "pusher:ping", data: {} }));
      activityTimer = setTimeout(() => socket?.close(), 30000);
    }, activityTimeout);
  };

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
          channel: TRANSACTIONS_CHANNEL,
        },
      })
    );
  };

  const connect = () => {
    if (closedByCaller) return;

    try {
      const pusherUrl = buildPusherUrl();
      if (!pusherUrl) return;

      socket = new WebSocket(pusherUrl);
    } catch {
      scheduleReconnect();
      return;
    }

    socket.onmessage = (message) => {
      const payload = parseEventData(message.data);
      if (!payload || typeof payload !== "object") return;

      const event = String((payload as { event?: string }).event ?? "");
      const data = parseEventData((payload as { data?: unknown }).data);
      if (event === "pusher:connection_established") {
        const seconds = Number(data?.activity_timeout);
        activityTimeout = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 120000) : 120000;
        subscribe();
      }
      resetActivityTimer();
      if (event === "pusher:ping") {
        socket?.send(JSON.stringify({ event: "pusher:pong", data: {} }));
        return;
      }
      const channel = String((payload as { channel?: string }).channel ?? "");
      if (channel && channel !== TRANSACTIONS_CHANNEL) return;
      if (event === "pusher_internal:subscription_succeeded") {
        onSubscribed?.();
        return;
      }
      if (event.startsWith("pusher:")) return;

      if (event !== "created" && event !== ".created" && event !== "updated" && event !== ".updated") {
        return;
      }

      if (!data || typeof data !== "object") return;

      const transactionPayload = data as TransactionUpdatePayload;
      if (!transactionPayload.record) {
        return;
      }

      if (["docking", "banyera", "tickets", "payment"].includes(transactionPayload.type ?? "")) {
        onCollectionUpdate?.(transactionPayload.record, transactionPayload);
      }

      if (
        transactionPayload.type === "docking" ||
        transactionPayload.type === "banyera" ||
        transactionPayload.type === "tickets"
      ) {
        onTransactionUpdate?.(transactionPayload.record, transactionPayload);
        return;
      }

      if (transactionPayload.type === "remittance") {
        onRemittanceUpdate(transactionPayload.record, transactionPayload);
      }
    };

    socket.onerror = () => {
      socket?.close();
    };

    socket.onclose = () => {
      clearActivityTimer();
      scheduleReconnect();
    };
  };

  connect();

  return () => {
    closedByCaller = true;
    clearReconnectTimer();
    clearActivityTimer();
    socket?.close();
    socket = null;
  };
}
