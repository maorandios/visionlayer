"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { CameraOpsCard } from "@/components/operations/CameraOpsCard";
import { CameraOpsPanel } from "@/components/operations/CameraOpsPanel";
import { CameraStage } from "@/components/operations/CameraStage";
import { legacyCameraToOps, opsHref, parseOpsTab, type OpsTab } from "@/components/operations/ops-url";
import { Button } from "@/components/ui/Button";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "@/components/ui/StateBlock";
import { t } from "@/i18n/he";
import { api } from "@/lib/api";
import { isDevEnvironment } from "@/lib/navigation";
import { applyRuleEnabled } from "@/lib/rules-list-state";
import type { Camera, Rule } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { isVirtualCamera, useCatalog } from "@/providers/CatalogProvider";
import { useEvents } from "@/providers/EventsProvider";

function OperationsInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { token, hub } = useAuth();
  const { rulesForCamera, zonesForCamera, linesForCamera, refresh: refreshCatalog } = useCatalog();
  const { events } = useEvents();

  const cameraId = search.get("camera");
  const tab = parseOpsTab(search.get("tab"));

  const [cameras, setCameras] = useState<Camera[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const cams = await api.cameras.list(token);
      setCameras(cams);
      if (cameraId) {
        const r = await api.rules.list(token);
        setRules(r.filter((rule) => rule.conditions.camera_id === cameraId));
      } else {
        setRules([]);
      }
    } catch {
      setError(t("dataLoadError"));
    } finally {
      setLoading(false);
    }
  }, [token, cameraId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(() => cameras.find((c) => c.id === cameraId) ?? null, [cameras, cameraId]);

  // Invalid camera id → back to grid
  useEffect(() => {
    if (!loading && cameraId && cameras.length > 0 && !selected) {
      router.replace("/");
    }
  }, [loading, cameraId, cameras.length, selected, router]);

  const setFocus = (id: string | null, nextTab: OpsTab = "activity") => {
    router.replace(opsHref(id, nextTab), { scroll: false });
  };

  const setTab = (next: OpsTab) => {
    if (cameraId) router.replace(opsHref(cameraId, next), { scroll: false });
  };

  /**
   * Toggle a single Rule by id — optimistic local patch, then PATCH /rules/{id}.
   * Never bulk-assigns `enabled` across the camera's Rules list.
   * Rollback flips only the failed Rule id (siblings stay as-is).
   */
  const toggleRule = useCallback(
    async (ruleId: string, enabled: boolean) => {
      if (!token) return;
      if (!ruleId) return;
      setRules((curr) => applyRuleEnabled(curr, ruleId, enabled));
      try {
        const updated = await api.rules.update(token, ruleId, { enabled });
        // Reconcile ONLY the patched id — never map enabled onto siblings.
        setRules((curr) =>
          curr.map((r) => {
            if (r.id !== ruleId) return r;
            return {
              ...r,
              enabled: Boolean(updated.enabled),
              updated_at: updated.updated_at ?? r.updated_at,
            };
          }),
        );
        void refreshCatalog();
      } catch (e) {
        setRules((curr) => applyRuleEnabled(curr, ruleId, !enabled));
        throw e;
      }
    },
    [token, refreshCatalog],
  );

  const real = cameras.filter((c) => !isVirtualCamera(c));
  const virtual = cameras.filter((c) => isVirtualCamera(c));
  const productionExists = real.length > 0;
  const showVirtualInMain = !productionExists || isDevEnvironment(hub);

  const newEventsFor = (id: string) => events.filter((e) => e.camera_id === id && e.state === "new").length;

  if (loading && cameras.length === 0) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} onRetry={load} />;

  // ---- Focus mode
  if (selected) {
    return (
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden"
        data-testid="ops-focus"
        data-camera-id={selected.id}
      >
        {/* Same-height row: video LEFT · panel RIGHT */}
        <div
          dir="ltr"
          className="grid h-full min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[minmax(0,1.65fr)_minmax(18rem,1fr)] lg:items-stretch"
        >
          <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-canvas shadow-soft">
            <CameraStage camera={selected} />
          </div>
          <div
            dir="rtl"
            className="glass-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl p-3 sm:p-4"
          >
            <CameraOpsPanel
              camera={selected}
              zones={zonesForCamera(selected.id)}
              lines={linesForCamera(selected.id)}
              rules={rules}
              tab={tab}
              onTabChange={setTab}
              onToggleRule={toggleRule}
              onCameraUpdated={() => void load()}
              onDataChanged={() => void load()}
            />
          </div>
        </div>
      </div>
    );
  }

  // ---- Grid
  if (cameras.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center" data-testid="ops-empty">
        <EmptyBlock
          message={t("opsEmptyTitle")}
          hint={t("opsEmptyBody")}
          action={
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
              <Link href="/cameras/new">
                <Button data-testid="ops-empty-add-camera">
                  <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
                  {t("cameraAddCta")}
                </Button>
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  const renderGrid = (list: Camera[]) => (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="ops-camera-grid">
      {list.map((cam) => (
        <li key={cam.id}>
          <CameraOpsCard
            camera={cam}
            activeRules={rulesForCamera(cam.id).filter((r) => r.enabled).length}
            newEvents={newEventsFor(cam.id)}
            onSelect={() => setFocus(cam.id)}
          />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-6" data-testid="ops-workspace">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">{t("cameraOpsTitle")}</h1>
          <p className="mt-0.5 text-sm text-ink-muted">{t("productionCameras")}</p>
        </div>
        <Link href="/cameras/new">
          <Button size="sm" data-testid="ops-add-camera">
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
            {t("cameraAddCta")}
          </Button>
        </Link>
      </div>

      {productionExists ? renderGrid(real) : null}

      {showVirtualInMain && virtual.length > 0 ? (
        <section className="space-y-3 border-t border-dashed border-border pt-5" data-testid="ops-dev-cameras">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{t("developmentSources")}</p>
          {renderGrid(virtual)}
        </section>
      ) : null}

      {!productionExists && virtual.length === 0 ? renderGrid(cameras) : null}
    </div>
  );
}

export function OperationsWorkspace() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <OperationsInner />
    </Suspense>
  );
}

/** Used by legacy `/cameras/[id]` to bounce into ops focus. */
export { legacyCameraToOps };
