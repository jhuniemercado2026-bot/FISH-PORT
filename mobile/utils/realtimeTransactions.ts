type TransactionUpdatePayload = {
  type?: string;
  action?: string;
  record?: Record<string, any>;
};

type RealtimeOptions = {
  onTransactionUpdate?: (record: Record<string, any>, payload: TransactionUpdatePayload) => void;
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

export function startTransactionsRealtime({ onRemittanceUpdate, onTransactionUpdate }: RealtimeOptions) {
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

    socket.onopen = subscribe;

    socket.onmessage = (message) => {
      const payload = parseEventData(message.data);
      if (!payload || typeof payload !== "object") return;

      const event = String((payload as { event?: string }).event ?? "");
      if (event.startsWith("pusher:")) return;

      const channel = String((payload as { channel?: string }).channel ?? "");
      if (channel && channel !== TRANSACTIONS_CHANNEL) return;

      if (event !== "created" && event !== ".created" && event !== "updated" && event !== ".updated") {
        return;
      }

      const data = parseEventData((payload as { data?: unknown }).data);
      if (!data || typeof data !== "object") return;

      const transactionPayload = data as TransactionUpdatePayload;
      if (!transactionPayload.record) {
        return;
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
