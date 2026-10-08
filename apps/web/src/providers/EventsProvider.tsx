"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "@/lib/api";
import { applyWsMessage, nextReconnectDelayMs } from "@/lib/events-realtime";
import type { EventItem, WsMessage } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useToast } from "@/providers/ToastProvider";
import { t } from "@/i18n/he";

type EventsContextValue = {
  events: EventItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  prependEvent: (event: EventItem) => void;
  patchEvent: (id: string, patch: Partial<EventItem>) => void;
};

const EventsContext = createContext<EventsContextValue | null>(null);

function closeSocketQuietly(ws: WebSocket) {
  ws.onopen = null;
  ws.onmessage = null;
  ws.onerror = null;
  ws.onclose = null;
  if (ws.readyState === WebSocket.OPEN) {
    ws.close();
    return;
  }
  if (ws.readyState === WebSocket.CONNECTING) {
    // Avoid "closed before the connection is established" console noise:
    // close only after the handshake finishes (or fails).
    const finish = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
    ws.addEventListener("open", finish, { once: true });
    ws.addEventListener("error", finish, { once: true });
  }
}

export function EventsProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);
  const mountedRef = useRef(true);
  const showToastRef = useRef(showToast);
  const prependRef = useRef<(event: EventItem) => void>(() => undefined);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const list = await api.events.list(token, { limit: 100 });
      setEvents(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [token]);

  const prependEvent = useCallback((event: EventItem) => {
    setEvents((prev) => applyWsMessage(prev, { type: "event.created", event }).events);
  }, []);

  const patchEvent = useCallback((id: string, patch: Partial<EventItem>) => {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  useEffect(() => {
    prependRef.current = prependEvent;
  }, [prependEvent]);

  useEffect(() => {
    if (token) void refresh();
  }, [token, refresh]);

  useEffect(() => {
    mountedRef.current = true;
    if (!token) return undefined;

    let timer: number | undefined;

    const connect = () => {
      if (!mountedRef.current || !token) return;
      const ws = new WebSocket(api.wsEventsUrl(token));
      wsRef.current = ws;

      ws.onopen = () => {
        backoffRef.current = 1000;
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as WsMessage;
          if (msg.type === "event.created" && msg.event) {
            prependRef.current(msg.event);
            showToastRef.current(`${t("toastNewEvent")}: ${msg.event.message_he ?? ""}`);
          }
        } catch {
          /* ignore malformed */
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        const delay = backoffRef.current;
        backoffRef.current = nextReconnectDelayMs(delay);
        timer = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (timer) window.clearTimeout(timer);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) closeSocketQuietly(ws);
    };
  }, [token]);

  const value = useMemo(
    () => ({ events, loading, error, refresh, prependEvent, patchEvent }),
    [events, loading, error, refresh, prependEvent, patchEvent],
  );

  return <EventsContext.Provider value={value}>{children}</EventsContext.Provider>;
}

export function useEvents() {
  const ctx = useContext(EventsContext);
  if (!ctx) throw new Error("useEvents outside provider");
  return ctx;
}
