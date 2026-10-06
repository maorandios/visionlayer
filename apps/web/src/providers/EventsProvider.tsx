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

export function EventsProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);
  const mountedRef = useRef(true);

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
    if (token) refresh();
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
            prependEvent(msg.event);
            showToast(`${t("toastNewEvent")}: ${msg.event.message_he ?? ""}`);
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
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [token, prependEvent, showToast]);

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
