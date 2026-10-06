"use client";

/**
 * Catalog of cameras / zones / lines / rules for Hebrew labels and counts in the UI.
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
import type { Camera, Line, Rule, Zone } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";

type CatalogValue = {
  cameras: Camera[];
  zones: Zone[];
  lines: Line[];
  rules: Rule[];
  loading: boolean;
  refresh: () => Promise<void>;
  cameraName: (id: string | null | undefined) => string;
  zoneName: (id: string | null | undefined) => string;
  lineName: (id: string | null | undefined) => string;
  ruleName: (id: string | null | undefined) => string;
  zonesForCamera: (cameraId: string) => Zone[];
  linesForCamera: (cameraId: string) => Line[];
  rulesForCamera: (cameraId: string) => Rule[];
};

const CatalogContext = createContext<CatalogValue | null>(null);

/** Video Lab creates virtual cameras with this id prefix; they are development sources, not real feeds. */
export function isVirtualCamera(camera: Pick<Camera, "id"> | string | null | undefined): boolean {
  const id = typeof camera === "string" ? camera : camera?.id;
  return typeof id === "string" && id.startsWith("vcam_");
}

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) {
      setCameras([]);
      setZones([]);
      setLines([]);
      setRules([]);
      return;
    }
    setLoading(true);
    try {
      const cams = await api.cameras.list(token);
      const [zoneLists, lineLists, ruleList] = await Promise.all([
        Promise.all(cams.map((c) => api.zones.listForCamera(token, c.id))),
        Promise.all(
          cams.map((c) => api.lines.listForCamera(token, c.id).catch(() => [] as Line[])),
        ),
        api.rules.list(token),
      ]);
      setCameras(cams);
      setZones(zoneLists.flat());
      setLines(lineLists.flat());
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
    const lineMap = new Map(lines.map((l) => [l.id, l.name]));
    const ruleMap = new Map(rules.map((r) => [r.id, r.name]));
    return {
      cameras,
      zones,
      lines,
      rules,
      loading,
      refresh,
      cameraName: (id) => (id ? camMap.get(id) ?? "—" : "—"),
      zoneName: (id) => (id ? zoneMap.get(id) ?? "—" : "—"),
      lineName: (id) => (id ? lineMap.get(id) ?? "—" : "—"),
      ruleName: (id) => (id ? ruleMap.get(id) ?? "—" : "—"),
      zonesForCamera: (cameraId) => zones.filter((z) => z.camera_id === cameraId),
      linesForCamera: (cameraId) => lines.filter((l) => l.camera_id === cameraId),
      rulesForCamera: (cameraId) => rules.filter((r) => r.conditions?.camera_id === cameraId),
    };
  }, [cameras, zones, lines, rules, loading, refresh]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog outside provider");
  return ctx;
}
