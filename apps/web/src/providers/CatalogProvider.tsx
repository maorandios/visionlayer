"use client";

/**
 * Catalog of cameras / zones / rules for Hebrew labels in the UI.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "@/lib/api";
import type { Camera, Rule, Zone } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";

type CatalogValue = {
  cameras: Camera[];
  zones: Zone[];
  rules: Rule[];
  loading: boolean;
  refresh: () => Promise<void>;
  cameraName: (id: string | null | undefined) => string;
  zoneName: (id: string | null | undefined) => string;
  ruleName: (id: string | null | undefined) => string;
};

const CatalogContext = createContext<CatalogValue | null>(null);

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) {
      setCameras([]);
      setZones([]);
      setRules([]);
      return;
    }
    setLoading(true);
    try {
      const cams = await api.cameras.list(token);
      const zoneLists = await Promise.all(
        cams.map((c) => api.zones.listForCamera(token, c.id)),
      );
      const ruleList = await api.rules.list(token);
      setCameras(cams);
      setZones(zoneLists.flat());
      setRules(ruleList);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<CatalogValue>(() => {
    const camMap = new Map(cameras.map((c) => [c.id, c.name]));
    const zoneMap = new Map(zones.map((z) => [z.id, z.name]));
    const ruleMap = new Map(rules.map((r) => [r.id, r.name]));
    return {
      cameras,
      zones,
      rules,
      loading,
      refresh,
      cameraName: (id) => (id ? camMap.get(id) ?? "—" : "—"),
      zoneName: (id) => (id ? zoneMap.get(id) ?? "—" : "—"),
      ruleName: (id) => (id ? ruleMap.get(id) ?? "—" : "—"),
    };
  }, [cameras, zones, rules, loading, refresh]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog outside provider");
  return ctx;
}
