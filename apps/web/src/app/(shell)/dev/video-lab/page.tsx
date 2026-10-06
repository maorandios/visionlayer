"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Film, Pause, Play, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { RunMetrics } from "@/components/video-lab/RunMetrics";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "@/components/ui/StateBlock";
import { api } from "@/lib/api";
import { objectClassHe } from "@/lib/format";
import type {
  BenchmarkHistoryItem,
  BenchmarkRun,
  Line,
  Rule,
  TrackReviewStatus,
  VideoLabAsset,
  VideoLabJob,
  VideoLabTrackCard,
  Zone,
} from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { t } from "@/i18n/he";

function labHref(assetId: string | null, runId: string | null): string {
  const params = new URLSearchParams();
  if (assetId) params.set("asset", assetId);
  if (runId) params.set("run", runId);
  const q = params.toString();
  return q ? `/dev/video-lab?${q}` : "/dev/video-lab";
}

function fmtSec(sec: number | undefined | null): string {
  if (sec == null || Number.isNaN(sec)) return "—";
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function fmtClock(sec: number | undefined | null): string {
  if (sec == null || Number.isNaN(sec)) return "—";
  const total = Math.max(0, Math.round(sec));
  const m = Math.floor(total / 60);
  const r = total % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function fmtHistoryWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

const FILTERS: Array<{ key: string | null; label: string; classes: string[] }> = [
  { key: null, label: t("allClasses"), classes: [] },
  { key: "person", label: t("filterPeople"), classes: ["person"] },
  { key: "car", label: t("filterCars"), classes: ["car"] },
  { key: "motorcycle", label: t("filterMotorcycles"), classes: ["motorcycle"] },
  { key: "truck", label: t("filterTrucks"), classes: ["truck"] },
  { key: "bicycle", label: t("filterBicycles"), classes: ["bicycle"] },
  { key: "bus", label: t("filterBuses"), classes: ["bus"] },
];

const REVIEW_FILTERS: Array<{ key: TrackReviewStatus | "all"; label: string }> = [
  { key: "all", label: t("filterReviewAll") },
  { key: "correct", label: t("filterReviewCorrect") },
  { key: "false_positive", label: t("filterReviewFp") },
  { key: "unreviewed", label: t("filterReviewPending") },
];

const PLURAL_HE: Record<string, string> = {
  person: "אדם",
  car: "מכונית",
  motorcycle: "אופנוע",
  truck: "משאית",
  bicycle: "אופניים",
  bus: "אוטובוס",
};

function MetricCard({
  label,
  value,
  sub,
  title,
}: {
  label: string;
  value: string;
  sub?: string;
  title?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 px-3 py-2" title={title}>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="text-lg font-semibold text-ink">{value}</p>
      {sub ? <p className="text-xs text-ink-muted">{sub}</p> : null}
    </div>
  );
}

function TrackCard({
  token,
  jobId,
  runId,
  card,
  showDebugId,
  onReviewed,
}: {
  token: string;
  jobId: string;
  runId: string;
  card: VideoLabTrackCard;
  showDebugId: boolean;
  onReviewed: (bench: BenchmarkRun) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const status = card.review_status ?? "unreviewed";

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    (async () => {
      if (!card.has_image) return;
      try {
        const blob = await api.videoLab.trackImageBlob(token, jobId, card.track_id);
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      } catch {
        if (!cancelled) setSrc(null);
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [token, jobId, card.has_image, card.track_id]);

  async function setStatus(next: TrackReviewStatus) {
    setSaving(true);
    try {
      const bench = await api.videoLab.setTrackReview(token, runId, card.track_id, next);
      onReviewed(bench);
    } catch {
      /* keep previous */
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-surface text-start">
      <div className="relative aspect-video bg-ink" dir="ltr">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={card.class_he} className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-ink-muted">
            {card.has_image ? t("loading") : "אין תמונה"}
          </div>
        )}
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-ink">{card.class_he}</p>
          {showDebugId ? <span className="text-xs text-ink-muted">#{card.track_id}</span> : null}
        </div>
        <p className="text-sm text-ink-muted">
          {t("confidence")} {card.confidence_pct}%
        </p>
        <p className="text-xs text-ink-muted">
          {t("seenFor")} {card.duration.toFixed(1)} {t("secondsUnit")}
        </p>
        <div className="flex flex-wrap gap-1 pt-1">
          {(
            [
              ["correct", t("reviewCorrect")],
              ["false_positive", t("reviewFalse")],
              ["unreviewed", t("reviewUnreviewed")],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              disabled={saving}
              onClick={() => void setStatus(key)}
              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                status === key ? "border-ink bg-ink text-white" : "border-border text-ink-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

function VideoLabInner() {
  const { token, hub } = useAuth();
  const enabled = hub?.features?.video_lab === true;
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlAsset = searchParams.get("asset");
  const urlRun = searchParams.get("run");

  const [assets, setAssets] = useState<VideoLabAsset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(urlAsset);
  const [job, setJob] = useState<VideoLabJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nameHe, setNameHe] = useState("");
  const [location, setLocation] = useState("");
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressPhase, setProgressPhase] = useState("");
  const [galleryFilter, setGalleryFilter] = useState<string | null>(null);
  const [reviewFilter, setReviewFilter] = useState<TrackReviewStatus | "all">("all");
  const [showSourceVideo, setShowSourceVideo] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraRules, setCameraRules] = useState<Rule[]>([]);
  const [cameraZones, setCameraZones] = useState<Zone[]>([]);
  const [cameraLines, setCameraLines] = useState<Line[]>([]);
  const [runHistory, setRunHistory] = useState<BenchmarkHistoryItem[]>([]);
  const [benchmark, setBenchmark] = useState<BenchmarkRun | null>(null);
  const restoredRunRef = useRef<string | null>(null);
  const skipAutoOpenRef = useRef(false);

  const selected = assets.find((a) => a.id === selectedId) ?? null;
  const showDebugIds = process.env.NODE_ENV === "development";

  const syncUrl = useCallback(
    (assetId: string | null, runId: string | null) => {
      const next = labHref(assetId, runId);
      const cur = `${window.location.pathname}${window.location.search}`;
      if (cur !== next) router.replace(next, { scroll: false });
    },
    [router],
  );

  const load = useCallback(async () => {
    if (!token || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      const list = await api.videoLab.list(token);
      setAssets(list);
      const preferred = urlAsset && list.some((a) => a.id === urlAsset) ? urlAsset : list[0]?.id ?? null;
      setSelectedId((prev) => prev ?? preferred);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [token, enabled, urlAsset]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep selected asset in sync with URL when navigating back/forward
  useEffect(() => {
    if (urlAsset && urlAsset !== selectedId) {
      setSelectedId(urlAsset);
      setJob(null);
      setBenchmark(null);
      restoredRunRef.current = null;
    }
  }, [urlAsset]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!token || !selectedId) {
      setVideoUrl(null);
      return;
    }
    let url: string | null = null;
    (async () => {
      try {
        const blob = await api.videoLab.videoBlob(token, selectedId);
        url = URL.createObjectURL(blob);
        setVideoUrl(url);
      } catch {
        setVideoUrl(null);
      }
    })();
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [token, selectedId]);

  useEffect(() => {
    if (!token || !selected) {
      setCameraRules([]);
      setCameraZones([]);
      setCameraLines([]);
      setRunHistory([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [rules, zones, lines, runs] = await Promise.all([
          api.rules.list(token),
          api.zones.listForCamera(token, selected.camera_id),
          api.lines.listForCamera(token, selected.camera_id),
          api.videoLab.listRuns(token, selected.id),
        ]);
        if (cancelled) return;
        setCameraZones(zones);
        setCameraLines(lines);
        setCameraRules(
          rules.filter(
            (r) => !r.conditions.camera_id || r.conditions.camera_id === selected.camera_id,
          ),
        );
        setRunHistory(runs);

        // Restore run from URL (run id or legacy job id); otherwise open latest unless closed
        let wantRun: string | null = null;
        const byId = urlRun ? runs.find((r) => r.id === urlRun) : undefined;
        const byJob = urlRun && !byId ? runs.find((r) => r.job_id === urlRun) : undefined;
        if (byId || byJob) {
          wantRun = (byId ?? byJob)!.id;
          skipAutoOpenRef.current = false;
        } else if (!skipAutoOpenRef.current && runs[0]) {
          wantRun = runs[0].id;
        }

        if (wantRun && restoredRunRef.current !== `${selected.id}:${wantRun}`) {
          restoredRunRef.current = `${selected.id}:${wantRun}`;
          try {
            const bench = await api.videoLab.getRun(token, wantRun);
            if (cancelled) return;
            setBenchmark(bench);
            const linked = await api.videoLab.getJob(token, bench.job_id);
            if (cancelled) return;
            setJob(linked);
            syncUrl(selected.id, wantRun);
          } catch {
            if (!cancelled) {
              setBenchmark(null);
              setJob(null);
            }
          }
        } else if (!wantRun) {
          setBenchmark(null);
          setJob(null);
          if (urlRun) syncUrl(selected.id, null);
        }
      } catch {
        if (!cancelled) {
          setCameraRules([]);
          setCameraZones([]);
          setCameraLines([]);
          setRunHistory([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, selected, urlRun, syncUrl]);

  async function onUpload(file: File | null) {
    if (!token) {
      setError("יש להתחבר מחדש לפני העלאה");
      return;
    }
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const asset = await api.videoLab.upload(
        token,
        file,
        nameHe.trim() || file.name.replace(/\.[^.]+$/, ""),
        location.trim() || undefined,
      );
      setNameHe("");
      setLocation("");
      setSelectedId(asset.id);
      setJob(null);
      setBenchmark(null);
      restoredRunRef.current = null;
      skipAutoOpenRef.current = true; // new upload: stay on setup until analyze
      setGalleryFilter(null);
      setReviewFilter("all");
      setProgressPct(0);
      setProgressPhase("");
      const list = await api.videoLab.list(token);
      setAssets(list);
      const runs = await api.videoLab.listRuns(token, asset.id);
      setRunHistory(runs);
      syncUrl(asset.id, null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorSave"));
    } finally {
      setUploading(false);
    }
  }

  async function onAnalyze() {
    if (!token || !selectedId) return;
    setAnalyzing(true);
    setError(null);
    setProgressPct(1);
    setProgressPhase("מתחיל…");
    setJob(null);
    setBenchmark(null);
    setShowSourceVideo(false);
    try {
      let current = await api.videoLab.analyze(token, selectedId);
      setJob(current);
      setProgressPct(current.progress?.percent ?? 1);
      setProgressPhase(current.progress?.phase_he ?? "מנתח…");

      while (current.status === "running") {
        await new Promise((r) => setTimeout(r, 700));
        current = await api.videoLab.getJob(token, current.id);
        setJob(current);
        setProgressPct(current.progress?.percent ?? progressPct);
        setProgressPhase(current.progress?.phase_he ?? "");
      }

      if (current.status === "failed") {
        setError(current.error_he || "הניתוח נכשל");
        return;
      }

      const bench = current.benchmark ?? current.summary.benchmark ?? null;
      setBenchmark(bench);
      const unique = bench?.metrics.unique_tracks_by_class ?? current.summary.unique_tracks_by_class ?? {};
      const preferred =
        current.summary.search_classes?.find((c) => (unique[c] ?? 0) > 0) ??
        Object.keys(unique)[0] ??
        null;
      setGalleryFilter(preferred);
      setReviewFilter("all");
      const runs = await api.videoLab.listRuns(token, selectedId);
      setRunHistory(runs);
      const newRunId = bench?.id ?? current.benchmark_run_id ?? current.id;
      restoredRunRef.current = `${selectedId}:${newRunId}`;
      syncUrl(selectedId, newRunId);
      // Scroll results into view
      requestAnimationFrame(() => {
        document.getElementById("video-lab-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorLoad"));
    } finally {
      setAnalyzing(false);
    }
  }

  async function openHistoryRun(runId: string) {
    if (!token || !selectedId) return;
    setError(null);
    try {
      const bench = await api.videoLab.getRun(token, runId);
      setBenchmark(bench);
      const linked = await api.videoLab.getJob(token, bench.job_id);
      setJob(linked);
      setReviewFilter("all");
      restoredRunRef.current = `${selectedId}:${runId}`;
      syncUrl(selectedId, runId);
      requestAnimationFrame(() => {
        document.getElementById("video-lab-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorLoad"));
    }
  }

  function selectAsset(assetId: string) {
    skipAutoOpenRef.current = false;
    setSelectedId(assetId);
    setJob(null);
    setBenchmark(null);
    restoredRunRef.current = null;
    setGalleryFilter(null);
    setReviewFilter("all");
    setProgressPct(0);
    setProgressPhase("");
    setShowSourceVideo(false);
    syncUrl(assetId, null);
  }

  function clearResultsView() {
    skipAutoOpenRef.current = true;
    setJob(null);
    setBenchmark(null);
    restoredRunRef.current = selectedId ? `${selectedId}:cleared` : null;
    if (selectedId) syncUrl(selectedId, null);
  }

  const benchmarkGallery = benchmark?.track_gallery;
  const jobSummaryGallery = job?.summary.track_gallery;
  const jobBenchmarkGallery = job?.benchmark?.track_gallery;
  const trackGallery = useMemo(
    () => benchmarkGallery ?? jobSummaryGallery ?? jobBenchmarkGallery ?? [],
    [benchmarkGallery, jobSummaryGallery, jobBenchmarkGallery],
  );
  const uniqueByClass =
    benchmark?.metrics.unique_tracks_by_class ?? job?.summary.unique_tracks_by_class ?? {};
  const detectionsByClass =
    benchmark?.metrics.detections_by_class ?? job?.summary.class_counts ?? {};
  const filteredGallery = useMemo(() => {
    let list = trackGallery;
    if (galleryFilter) list = list.filter((c) => c.class === galleryFilter);
    if (reviewFilter !== "all") {
      list = list.filter((c) => (c.review_status ?? "unreviewed") === reviewFilter);
    }
    return list;
  }, [trackGallery, galleryFilter, reviewFilter]);

  const fp = benchmark?.metrics.false_positives;
  const runId = benchmark?.id ?? job?.benchmark_run_id ?? job?.summary.benchmark_run_id ?? job?.id;

  if (!enabled) {
    return <ErrorBlock message="מעבדת וידאו כבויה או לא זמינה במצב זה" />;
  }
  if (loading) return <LoadingBlock />;

  const ruleCreateHref = selected
    ? `/rules/new?cameraId=${encodeURIComponent(selected.camera_id)}&lab=1&assetId=${encodeURIComponent(selected.id)}${
        runId ? `&runId=${encodeURIComponent(runId)}` : ""
      }${galleryFilter ? `&objectClass=${encodeURIComponent(galleryFilter)}` : ""}`
    : "/rules/new";

  const zoneCreateHref = selected
    ? `/cameras/${selected.camera_id}/zones/new?lab=1&assetId=${encodeURIComponent(selected.id)}${
        runId ? `&runId=${encodeURIComponent(runId)}` : ""
      }`
    : "#";

  const lineCreateHref = selected
    ? `/cameras/${selected.camera_id}/lines/new?lab=1&assetId=${encodeURIComponent(selected.id)}${
        runId ? `&runId=${encodeURIComponent(runId)}` : ""
      }`
    : "#";

  const ruleTargetClasses = new Set(
    cameraRules.filter((r) => r.enabled).flatMap((r) => r.conditions.object_classes ?? []),
  );
  const searchLabels = [...ruleTargetClasses].map((c) => objectClassHe(c));
  const canAnalyze = ruleTargetClasses.size > 0;
  const matchedRules = (job?.summary.rule_checks ?? []).filter((c) => c.triggered);
  const unmatchedRules = (job?.summary.rule_checks ?? []).filter((c) => !c.triggered);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-border bg-muted">
          <Film className="h-5 w-5 text-ink-muted" strokeWidth={1.75} aria-hidden />
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-ink">{t("videoLabTitle")}</h1>
            <Chip tone="dashed">{t("devToolBadge")}</Chip>
          </div>
          <p className="text-xs text-ink-muted">{t("videoLabHint")}</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {[
          { label: t("stepUpload"), active: true },
          { label: t("stepSetup"), active: Boolean(selected) },
          { label: t("stepAnalyze"), active: Boolean(selected) && (analyzing || Boolean(benchmark)) },
          {
            label: t("stepResults"),
            active: Boolean(benchmark) && job?.status === "completed",
          },
        ].map((step) => (
          <div
            key={step.label}
            className={`rounded-xl border px-3 py-2 ${
              step.active
                ? "border-ink bg-surface text-ink"
                : "border-border bg-muted/40 text-ink-muted"
            }`}
          >
            {step.label}
          </div>
        ))}
      </div>

      <Card className="space-y-3">
        <h2 className="text-sm font-medium text-ink">{t("stepUpload")}</h2>
        <Input
          placeholder={t("videoName")}
          value={nameHe}
          onChange={(e) => setNameHe(e.target.value)}
        />
        <Input
          placeholder={t("cameraLocation")}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted px-4 text-sm text-ink">
          <Upload className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {uploading ? t("loading") : "בחירת קובץ MP4 (עד 30 שניות)"}
          <input
            type="file"
            accept="video/mp4,video/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
          />
        </label>
      </Card>

      {error ? <ErrorBlock message={error} onRetry={load} /> : null}

      {assets.length === 0 ? (
        <EmptyBlock message={t("emptyVideos")} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {assets.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => selectAsset(a.id)}
              className={`rounded-2xl border p-3 text-start ${
                selectedId === a.id ? "border-ink bg-surface" : "border-border bg-surface"
              }`}
            >
              <p className="font-medium text-ink">{a.name_he}</p>
              <p className="mt-1 text-xs text-ink-muted">
                {fmtSec(a.duration_sec)} · {a.width}×{a.height} · {a.fps.toFixed(1)} FPS
              </p>
            </button>
          ))}
        </div>
      )}

      {selected ? (
        <Card className="space-y-4">
          <h2 className="text-sm font-medium text-ink">{t("stepSetup")} · {selected.name_he}</h2>

          <div className="rounded-2xl border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium text-ink">{t("analysisProgress")}</span>
              <span className="text-ink-muted">
                {analyzing ? `${Math.round(progressPct)}%` : job?.status === "completed" ? "100%" : "—"}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" dir="ltr">
              <div
                className="h-full rounded-full bg-ink transition-[width] duration-300"
                style={{
                  width: `${
                    analyzing || job?.status === "completed"
                      ? progressPct || (job?.status === "completed" ? 100 : 0)
                      : 0
                  }%`,
                }}
              />
            </div>
            <p className="text-xs text-ink-muted">
              {analyzing
                ? progressPhase || t("analysisRunning")
                : job?.status === "completed"
                  ? t("analysisDone")
                  : canAnalyze
                    ? `${t("willSearch")}: ${searchLabels.join(", ")}`
                    : t("needRuleBeforeAnalyze")}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={onAnalyze}
              disabled={analyzing || !canAnalyze}
              title={!canAnalyze ? t("needRuleBeforeAnalyze") : undefined}
            >
              {analyzing ? t("analysisRunning") : t("runAnalysis")}
            </Button>
          </div>

          <div className="space-y-2 rounded-2xl border border-dashed border-border bg-muted/20 p-3">
            <h3 className="text-sm font-medium text-ink">{t("activeRulesForCam")}</h3>
            {cameraZones.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("noZonesForCam")}</p>
            ) : null}
            {cameraLines.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("emptyLines")}</p>
            ) : null}
            {cameraRules.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("noRulesForCam")}</p>
            ) : (
              <ul className="space-y-2 text-sm text-ink">
                {cameraRules.map((r) => {
                  const cls = r.conditions.object_classes?.[0];
                  const zone = cameraZones.find((z) => z.id === r.conditions.zone_id);
                  const line = cameraLines.find((ln) => ln.id === r.conditions.line_id);
                  const trigger = r.conditions.trigger ?? "zone_presence";
                  return (
                    <li key={r.id} className="rounded-xl border border-border bg-surface px-3 py-2">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-ink-muted">
                        מחפש: {objectClassHe(cls)} · טריגר: {trigger}
                        {zone ? ` · אזור: ${zone.name}` : ""}
                        {line ? ` · קו: ${line.name}` : ""}
                        {r.conditions.min_duration_seconds
                          ? ` · משך: ${r.conditions.min_duration_seconds}ש׳`
                          : ""}
                        {r.conditions.threshold != null
                          ? ` · סף: ${r.conditions.threshold}`
                          : ""}
                        {!r.enabled ? " · כבוי" : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href={zoneCreateHref}>
                <Button variant="secondary">{t("drawZone")}</Button>
              </Link>
              <Link href={lineCreateHref}>
                <Button variant="secondary">{t("drawLine")}</Button>
              </Link>
              <Link href={ruleCreateHref}>
                <Button variant="secondary">{t("createRuleForCam")}</Button>
              </Link>
              <Link href={`/cameras/${selected.camera_id}`}>
                <Button variant="secondary">{t("openCamera")}</Button>
              </Link>
            </div>
          </div>

          <div>
            <Button variant="secondary" onClick={() => setShowSourceVideo((v) => !v)}>
              {showSourceVideo ? t("hideSourceVideo") : t("showSourceVideo")}
            </Button>
            {showSourceVideo && videoUrl ? (
              <div className="mt-3 space-y-2">
                <div className="relative overflow-hidden rounded-xl bg-ink" dir="ltr">
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    className="aspect-video w-full"
                    controls
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const el = videoRef.current;
                      if (!el) return;
                      if (el.paused) void el.play();
                      else el.pause();
                    }}
                  >
                    <Play className="me-1 inline h-4 w-4" /> / <Pause className="ms-1 inline h-4 w-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.currentTime = 0;
                        void videoRef.current.play();
                      }
                    }}
                  >
                    <RotateCcw className="me-1 inline h-4 w-4" />
                    נגן מחדש
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          {runHistory.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-ink">{t("analysisHistory")}</h3>
              <ul className="space-y-2">
                {runHistory.map((run) => (
                  <li key={run.id}>
                    <button
                      type="button"
                      onClick={() => void openHistoryRun(run.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-start text-sm ${
                        benchmark?.id === run.id
                          ? "border-ink bg-surface"
                          : "border-border bg-muted/20 text-ink-muted"
                      }`}
                    >
                      <p className="font-medium text-ink">{fmtHistoryWhen(run.analyzed_at)}</p>
                      <p className="text-xs">
                        {run.detector_model_display} · stride {run.frame_stride}
                      </p>
                      <p className="text-xs">
                        {fmtClock(run.analysis_time_seconds)} · {run.unique_tracks_total} tracks ·{" "}
                        {run.events_total} events
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}

      {job && job.status === "completed" && benchmark ? (
        <Card id="video-lab-results" className="space-y-5 scroll-mt-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-ink">
                {job.summary.message_he ?? t("analysisDone")}
              </h2>
              <p className="mt-1 text-xs text-ink-muted">{t("viewingStoredRun")}</p>
              {job.summary.guidance_he ? (
                <p className="mt-1 text-sm text-ink-muted">{job.summary.guidance_he}</p>
              ) : null}
            </div>
            <Button variant="secondary" onClick={clearResultsView}>
              {t("clearResultsView")}
            </Button>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <MetricCard
              label={t("metricDetections")}
              value={String(benchmark.metrics.detections_total)}
              title={t("detectionsTooltip")}
            />
            <MetricCard
              label={t("metricUniqueObjects")}
              value={String(benchmark.metrics.unique_tracks_total)}
            />
            <MetricCard
              label={t("metricEvents")}
              value={String(benchmark.metrics.events_total)}
            />
            <MetricCard
              label={t("metricFalsePositives")}
              value={
                !fp || fp.reviewed_tracks === 0
                  ? t("notYetReviewed")
                  : `${fp.false_positive_tracks} / ${fp.reviewed_tracks}`
              }
              sub={
                fp && fp.false_positive_rate != null
                  ? `${(fp.false_positive_rate * 100).toFixed(1)}%`
                  : undefined
              }
            />
            <MetricCard
              label={t("metricAnalysisTime")}
              value={fmtClock(benchmark.metrics.analysis_time_seconds)}
            />
            <MetricCard
              label={t("metricProcessingFps")}
              value={`${benchmark.metrics.processing_fps.toFixed(1)} FPS`}
            />
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-3 text-sm text-ink">
            <h3 className="mb-2 text-sm font-medium">{t("runDetails")}</h3>
            <div className="grid grid-cols-2 gap-2 text-xs text-ink-muted sm:grid-cols-3">
              <p>
                מודל: <span className="text-ink">{benchmark.config.detector_model_display}</span>
              </p>
              <p>
                Tracker: <span className="text-ink">{benchmark.config.tracker}</span>
              </p>
              <p>
                Stride: <span className="text-ink">{benchmark.config.frame_stride}</span>
              </p>
              <p>
                משך הסרטון:{" "}
                <span className="text-ink">{benchmark.config.video_duration_sec.toFixed(1)} שניות</span>
              </p>
              <p>
                FPS מקור: <span className="text-ink">{benchmark.config.source_video_fps}</span>
              </p>
              <p>
                Resolution:{" "}
                <span className="text-ink">
                  {benchmark.config.resolution.width}×{benchmark.config.resolution.height}
                </span>
              </p>
            </div>
          </div>

          <RunMetrics
            runId={benchmark.id}
            cameraId={benchmark.camera_id}
            lineName={(id) => cameraLines.find((l) => l.id === id)?.name ?? id ?? "—"}
            zoneName={(id) => cameraZones.find((z) => z.id === id)?.name ?? id ?? "—"}
          />

          <div>
            <h3 className="mb-2 text-sm font-medium text-ink">{t("byObjectClass")}</h3>
            <ul className="space-y-2 text-sm">
              {Object.keys({ ...uniqueByClass, ...detectionsByClass })
                .sort((a, b) => (uniqueByClass[b] ?? 0) - (uniqueByClass[a] ?? 0))
                .map((cls) => (
                  <li
                    key={cls}
                    className="flex items-baseline justify-between rounded-xl border border-border bg-surface px-3 py-2"
                  >
                    <span className="font-medium text-ink">{PLURAL_HE[cls] ?? objectClassHe(cls)}</span>
                    <span className="text-xs text-ink-muted">
                      <span className="text-ink">{uniqueByClass[cls] ?? 0}</span> {t("uniqueLabel")} ·{" "}
                      {detectionsByClass[cls] ?? 0} {t("detectionsLabel")}
                    </span>
                  </li>
                ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium text-ink">{t("detectionGallery")}</h3>
            <div className="mb-2 flex flex-wrap gap-2">
              {FILTERS.map((f) => {
                const count =
                  f.key == null
                    ? trackGallery.length
                    : f.classes.reduce((n, c) => n + (uniqueByClass[c] ?? 0), 0);
                const active = galleryFilter === f.key;
                return (
                  <button
                    key={f.label}
                    type="button"
                    onClick={() => setGalleryFilter(f.key)}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      active ? "border-ink bg-ink text-white" : "border-border bg-surface text-ink-muted"
                    }`}
                  >
                    {f.label} ({count})
                  </button>
                );
              })}
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {REVIEW_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setReviewFilter(f.key)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    reviewFilter === f.key
                      ? "border-ink bg-ink text-white"
                      : "border-border bg-surface text-ink-muted"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {filteredGallery.length === 0 ? (
              <p className="text-sm text-ink-muted">לא נמצאו אובייקטים במסנן זה</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {filteredGallery.map((card) => (
                  <TrackCard
                    key={card.track_id}
                    token={token!}
                    jobId={job.id}
                    runId={runId!}
                    card={card}
                    showDebugId={showDebugIds}
                    onReviewed={(bench) => {
                      setBenchmark(bench);
                      setJob((prev) =>
                        prev
                          ? {
                              ...prev,
                              benchmark: bench,
                              summary: {
                                ...prev.summary,
                                benchmark: bench,
                                track_gallery: bench.track_gallery,
                              },
                            }
                          : prev,
                      );
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {(job.summary.fragmentation_hints ?? []).length > 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3 text-xs text-ink-muted">
              {(job.summary.fragmentation_hints ?? []).map((h) => (
                <p key={h.class}>{h.message_he}</p>
              ))}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-medium text-ink">{t("ruleMatches")}</h3>
              {matchedRules.length === 0 ? (
                <p className="text-sm text-ink-muted">אין חוקים שהופעלו</p>
              ) : (
                <ul className="space-y-2">
                  {matchedRules.map((check) => (
                    <li key={check.rule_id} className="rounded-xl border border-ink bg-surface px-3 py-2 text-sm">
                      <p className="font-medium text-ink">{check.rule_name}</p>
                      <p className="mt-1 text-xs text-ink-muted">{check.reason_he}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium text-ink">חוקים שלא הותאמו</h3>
              {unmatchedRules.length === 0 ? (
                <p className="text-sm text-ink-muted">—</p>
              ) : (
                <ul className="space-y-2">
                  {unmatchedRules.map((check) => (
                    <li
                      key={check.rule_id}
                      className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm text-ink-muted"
                    >
                      <p className="font-medium text-ink">{check.rule_name}</p>
                      <p className="mt-1 text-xs">{check.reason_he}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-ink">{t("eventsTitle")}</h3>
              {benchmark.event_ids.length > 0 ? (
                <Link
                  href={`/events?returnTo=${encodeURIComponent(labHref(selectedId, runId ?? null))}`}
                  className="text-xs text-ink underline"
                >
                  {t("openRunEvents")}
                </Link>
              ) : null}
            </div>
            {(job.summary.hits ?? []).length === 0 ? (
              <p className="text-sm text-ink-muted">לא נוצרו אירועים</p>
            ) : (
              <ul className="space-y-2">
                {(job.summary.hits ?? []).map((hit) => (
                  <li
                    key={hit.event_id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium text-ink">{hit.rule_name}</p>
                      <p className="text-xs text-ink-muted">
                        {hit.object_class_he}
                        {hit.duration != null ? ` · ${hit.duration.toFixed(1)} ${t("secondsUnit")}` : ""}
                      </p>
                    </div>
                    <Link
                      href={`/events/${hit.event_id}?returnTo=${encodeURIComponent(
                        labHref(selectedId, runId ?? null),
                      )}`}
                      className="text-xs text-ink underline"
                    >
                      פרטי אירוע
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <details
            className="rounded-xl border border-border bg-muted/20 p-3"
            open={showDiagnostics}
            onToggle={(e) => setShowDiagnostics((e.target as HTMLDetailsElement).open)}
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-ink">
              <ChevronDown className="h-4 w-4" />
              {t("devDiagnostics")}
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-muted md:grid-cols-3">
              <p>פריימים בסרטון: {benchmark.metrics.video_frames_total}</p>
              <p>פריימים שנותחו AI: {benchmark.metrics.detector_frames_analyzed}</p>
              <p>Stride: {benchmark.config.frame_stride}</p>
              <p>detector_calls: {benchmark.metrics.detector_calls}</p>
              <p>
                {t("metricProcessingFps")}: {benchmark.metrics.processing_fps.toFixed(2)}
              </p>
              <p>source FPS: {benchmark.config.source_video_fps}</p>
              <p>analysis_time: {benchmark.metrics.analysis_time_seconds.toFixed(3)}s</p>
              <p>run_id: {benchmark.id}</p>
            </div>
          </details>
        </Card>
      ) : null}
    </div>
  );
}

export default function VideoLabPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <VideoLabInner />
    </Suspense>
  );
}
