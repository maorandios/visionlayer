"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "@/components/ui/StateBlock";
import { api } from "@/lib/api";
import type { AiTestDebugBundle, Line, Zone } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";

type TabId = "detections" | "tracks" | "rules" | "metrics" | "config";

const TABS: { id: TabId; label: string }[] = [
  { id: "detections", label: "זיהויים" },
  { id: "tracks", label: "מסלולים" },
  { id: "rules", label: "חוקים" },
  { id: "metrics", label: "מדדים" },
  { id: "config", label: "הגדרות הריצה" },
];

function fmtSec(sec: number | undefined | null): string {
  if (sec == null || Number.isNaN(sec)) return "—";
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = (s % 60).toFixed(1);
  return `${String(m).padStart(2, "0")}:${r.padStart(4, "0")}`;
}

export default function AiTestDebugPage() {
  const params = useParams();
  const runId = String(params.runId || "");
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<AiTestDebugBundle | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [tab, setTab] = useState<TabId>("tracks");
  const [selectedTrack, setSelectedTrack] = useState<number | null>(null);
  const [selectedRule, setSelectedRule] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [showDetections, setShowDetections] = useState(true);
  const [showTracks, setShowTracks] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const load = useCallback(async () => {
    if (!token || !runId) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await api.videoLab.getRunDebug(token, runId);
      setBundle(payload.debug);
      setAssetId(payload.asset_id);
      const [zs, ls, blob] = await Promise.all([
        api.zones.listForCamera(token, payload.camera_id),
        api.lines.listForCamera(token, payload.camera_id),
        api.videoLab.videoBlob(token, payload.asset_id),
      ]);
      setZones(zs);
      setLines(ls);
      setVideoUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בטעינת הניתוח");
    } finally {
      setLoading(false);
    }
  }, [token, runId]);

  useEffect(() => {
    void load();
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const overlaysByTime = useMemo(() => {
    const list = bundle?.overlays ?? [];
    return list.slice().sort((a, b) => a.timestamp_sec - b.timestamp_sec);
  }, [bundle]);

  const draw = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !bundle) return;
    const w = video.clientWidth;
    const h = video.clientHeight;
    if (w < 2 || h < 2) return;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    const tSec = video.currentTime;
    const vw = video.videoWidth || 1;
    const vh = video.videoHeight || 1;
    const sx = w / vw;
    const sy = h / vh;

    if (showZones) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(56, 189, 248, 0.85)";
      ctx.fillStyle = "rgba(56, 189, 248, 0.12)";
      for (const z of zones) {
        const pts = z.points || [];
        if (pts.length < 3) continue;
        ctx.beginPath();
        pts.forEach((p, i) => {
          const x = p[0] * w;
          const y = p[1] * h;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    if (showLines) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(251, 191, 36, 0.95)";
      for (const ln of lines) {
        const pts = ln.points || [];
        if (pts.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(pts[0][0] * w, pts[0][1] * h);
        ctx.lineTo(pts[1][0] * w, pts[1][1] * h);
        ctx.stroke();
      }
    }

    let frame = overlaysByTime[0];
    for (const o of overlaysByTime) {
      if (o.timestamp_sec <= tSec + 0.05) frame = o;
      else break;
    }
    if (frame && (showDetections || showTracks)) {
      for (const box of frame.boxes || []) {
        if (selectedTrack != null && box.track_id !== selectedTrack) continue;
        const [x1, y1, x2, y2] = box.bbox;
        ctx.strokeStyle = "rgba(74, 222, 128, 0.95)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x1 * sx, y1 * sy, (x2 - x1) * sx, (y2 - y1) * sy);
        const anchor = box.anchor_px;
        if (anchor && anchor.length >= 2) {
          ctx.fillStyle = "#f43f5e";
          ctx.beginPath();
          ctx.arc(anchor[0] * sx, anchor[1] * sy, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        if (showTracks) {
          const label = `${box.class} #${box.track_id}`;
          const conf = typeof box.confidence === "number" ? box.confidence.toFixed(2) : "";
          ctx.fillStyle = "rgba(0,0,0,0.65)";
          ctx.fillRect(x1 * sx, Math.max(0, y1 * sy - 32), 110, 30);
          ctx.fillStyle = "#fff";
          ctx.font = "12px ui-monospace, monospace";
          ctx.fillText(label, x1 * sx + 4, y1 * sy - 18);
          ctx.fillText(conf, x1 * sx + 4, y1 * sy - 4);
        }
      }
    }
  }, [bundle, overlaysByTime, zones, lines, showZones, showLines, showDetections, showTracks, selectedTrack]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => draw();
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("seeked", onTime);
    video.addEventListener("loadeddata", onTime);
    const id = window.setInterval(draw, 200);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("seeked", onTime);
      video.removeEventListener("loadeddata", onTime);
      window.clearInterval(id);
    };
  }, [draw]);

  function seekTo(sec: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, sec);
    void video.play();
  }

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} onRetry={() => void load()} />;
  if (!bundle) {
    return <EmptyBlock message="אין נתוני ניתוח" hint="הריצו בדיקת AI מחדש במצב דיוק." />;
  }

  const summary = bundle.summary;
  const track = (bundle.tracks as Array<Record<string, unknown>>).find(
    (t) => Number(t.track_id) === selectedTrack,
  );
  const rule = (bundle.rule_traces as Array<Record<string, unknown>>).find(
    (r) => String(r.rule_id) === selectedRule,
  );
  const metric = (bundle.metric_traces as Array<Record<string, unknown>>).find(
    (m) => String(m.metric_definition_id) === selectedMetric,
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4" data-testid="ai-test-debug" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-ink-muted">כלי פיתוח · ניתוח AI</p>
          <h1 className="text-xl font-semibold text-ink">{bundle.mode_he}</h1>
          <p className="text-sm text-ink-muted" dir="ltr">
            Run {summary.run_id}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dev/video-lab" className="text-sm text-accent underline">
            מעבדת וידאו
          </Link>
          {assetId ? (
            <Link href={`/dev/video-lab?run=${runId}&asset=${assetId}`} className="text-sm text-accent underline">
              תוצאות מעבדה
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2 rounded-lg border border-border bg-surface/50 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          פריימים: {summary.video_frames} · נותחו: {summary.frames_analyzed}
        </div>
        <div>
          Stride: {summary.stride} · סף: {summary.detection_threshold}
        </div>
        <div>
          זיהויים: {summary.detections} · מסלולים: {summary.confirmed_tracks}
        </div>
        <div>
          חציות: {summary.line_crossings} · אירועים: {summary.events_created}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
        <p className="mb-2 font-medium">משפך צינור</p>
        <p className="text-ink-muted" dir="ltr">
          {bundle.funnel.summary_line}
        </p>
        <ol className="mt-2 space-y-1">
          {bundle.funnel.stages.map((s) => (
            <li key={s.key} className="flex justify-between gap-4">
              <span>{s.label_he}</span>
              <span className="font-mono" dir="ltr">
                {s.count}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {bundle.expected_vs_actual && bundle.expected_vs_actual.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-ink-muted">
                <th className="p-2 text-right">מדד / חוק</th>
                <th className="p-2">Expected</th>
                <th className="p-2">Actual</th>
              </tr>
            </thead>
            <tbody>
              {bundle.expected_vs_actual.map((row) => (
                <tr key={row.label} className="border-b border-border/60">
                  <td className="p-2">{row.label}</td>
                  <td className="p-2 text-center font-mono" dir="ltr">
                    {String(row.expected)}
                  </td>
                  <td className="p-2 text-center font-mono" dir="ltr">
                    {String(row.actual ?? "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="relative overflow-hidden rounded-lg border border-border bg-black">
        {videoUrl ? (
          <>
            <video ref={videoRef} src={videoUrl} controls className="block w-full" playsInline />
            <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
          </>
        ) : (
          <p className="p-6 text-sm text-white/70">אין סרטון</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {(
          [
            ["זיהויים", showDetections, setShowDetections],
            ["מסלולים", showTracks, setShowTracks],
            ["אזורים", showZones, setShowZones],
            ["קווים", showLines, setShowLines],
            ["אירועים", showEvents, setShowEvents],
          ] as const
        ).map(([label, on, set]) => (
          <button
            key={label}
            type="button"
            className={`rounded-md border px-2 py-1 ${on ? "border-accent bg-accent/10" : "border-border"}`}
            onClick={() => set(Boolean(!on))}
          >
            {label}
          </button>
        ))}
      </div>

      {showEvents && bundle.event_markers.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {bundle.event_markers.map((m, i) => (
            <Button
              key={`${m.event_id}-${i}`}
              size="sm"
              variant="secondary"
              onClick={() => typeof m.video_sec === "number" && seekTo(m.video_sec)}
            >
              {fmtSec(m.video_sec)} · {m.label_he || "EVENT"}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm ${tab === x.id ? "bg-accent text-white" : "bg-muted text-ink"}`}
            onClick={() => setTab(x.id)}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === "detections" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-ink-muted">
                <th className="p-2 text-right">מחלקה</th>
                <th className="p-2">זיהויים</th>
                <th className="p-2">מסלולים</th>
                <th className="p-2">avg conf</th>
              </tr>
            </thead>
            <tbody>
              {bundle.per_class.map((r) => (
                <tr key={r.class} className="border-t border-border/50">
                  <td className="p-2">{r.class_he}</td>
                  <td className="p-2 text-center font-mono">{r.detections}</td>
                  <td className="p-2 text-center font-mono">{r.tracks}</td>
                  <td className="p-2 text-center font-mono" dir="ltr">
                    {r.confidence_avg ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "tracks" ? (
        <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {(bundle.tracks as Array<Record<string, unknown>>).map((tr) => (
              <button
                key={String(tr.track_id)}
                type="button"
                className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm ${
                  selectedTrack === Number(tr.track_id) ? "border-accent bg-accent/10" : "border-border"
                }`}
                onClick={() => {
                  setSelectedTrack(Number(tr.track_id));
                  seekTo(Number(tr.first_seen_sec) || 0);
                }}
              >
                <span>
                  {String(tr.class_he || tr.class)} #{String(tr.track_id)}
                </span>
                <span className="font-mono text-xs text-ink-muted" dir="ltr">
                  {fmtSec(Number(tr.first_seen_sec))}–{fmtSec(Number(tr.last_seen_sec))}
                </span>
              </button>
            ))}
          </div>
          <aside className="rounded-lg border border-border bg-surface/40 p-3 text-sm">
            {track ? (
              <div className="space-y-2">
                <p className="font-medium">
                  Track #{String(track.track_id)} · {String(track.class)}
                </p>
                <p className="text-xs text-ink-muted" dir="ltr">
                  {fmtSec(Number(track.first_seen_sec))} → {fmtSec(Number(track.last_seen_sec))}
                </p>
                <p>conf avg: {String(track.confidence_avg)}</p>
                <div>
                  <p className="text-xs text-ink-muted">אזורים</p>
                  <ul className="text-xs">
                    {((track.zone_history as Array<Record<string, unknown>>) || []).slice(-8).map((z, i) => (
                      <li key={i}>
                        {String(z.zone_name)}: {String(z.state)} @ {fmtSec(Number(z.video_sec))}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs text-ink-muted">חציות</p>
                  <ul className="text-xs">
                    {((track.crossings as Array<Record<string, unknown>>) || []).map((c, i) => (
                      <li key={i}>
                        {String(c.line_name)} {String(c.direction)} @ {fmtSec(Number(c.video_sec))}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="text-ink-muted">בחרו מסלול</p>
            )}
          </aside>
        </div>
      ) : null}

      {tab === "rules" ? (
        <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
          <div className="space-y-2">
            {(bundle.rule_traces as Array<Record<string, unknown>>).map((r) => (
              <button
                key={String(r.rule_id)}
                type="button"
                className={`w-full rounded-md border px-3 py-2 text-right text-sm ${
                  selectedRule === String(r.rule_id) ? "border-accent bg-accent/10" : "border-border"
                }`}
                onClick={() => setSelectedRule(String(r.rule_id))}
              >
                <div className="font-medium">{String(r.rule_name)}</div>
                <div className="text-xs text-ink-muted">
                  {String(r.candidate_count)} מועמדים · {String(r.matched_count)} התאמות ·{" "}
                  {String(r.rejected_count)} נדחו
                  {r.triggered ? " · EVENT" : ""}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {((r.top_rejection_reasons as Array<{ he?: string; count?: number }>) || []).map((x, i) => (
                    <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                      {x.he} ({x.count})
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
          <aside className="max-h-96 overflow-y-auto rounded-lg border border-border p-3 text-sm">
            {rule ? (
              <div className="space-y-2">
                <p className="font-medium">{String(rule.rule_name)}</p>
                {rule.schedule_warning ? (
                  <p className="text-xs text-warning">{String(rule.schedule_warning)}</p>
                ) : null}
                {rule.schedule_eval_timestamp ? (
                  <p className="text-xs text-ink-muted" dir="ltr">
                    schedule eval: {String(rule.schedule_eval_timestamp)}
                  </p>
                ) : null}
                {((rule.candidates as Array<Record<string, unknown>>) || []).map((c) => (
                  <div key={String(c.track_id)} className="rounded border border-border/60 p-2 text-xs">
                    <button
                      type="button"
                      className="font-medium text-accent"
                      onClick={() => {
                        setSelectedTrack(Number(c.track_id));
                        setTab("tracks");
                      }}
                    >
                      {String(c.class)} #{String(c.track_id)}
                    </button>
                    <p>{c.matched ? "✓ matched" : `✗ ${String(c.rejection_he || c.rejection_reason || "")}`}</p>
                    <ul className="mt-1 space-y-0.5 text-ink-muted">
                      {((c.checks as Array<Record<string, unknown>>) || []).map((ch, i) => (
                        <li key={i}>
                          {String(ch.key)} {ch.ok ? "✓" : "✗"}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-ink-muted">בחרו חוק</p>
            )}
          </aside>
        </div>
      ) : null}

      {tab === "metrics" ? (
        <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
          <div className="space-y-2">
            {(bundle.metric_traces as Array<Record<string, unknown>>).map((m) => (
              <button
                key={String(m.metric_definition_id)}
                type="button"
                className={`w-full rounded-md border px-3 py-2 text-right text-sm ${
                  selectedMetric === String(m.metric_definition_id)
                    ? "border-accent bg-accent/10"
                    : "border-border"
                }`}
                onClick={() => setSelectedMetric(String(m.metric_definition_id))}
              >
                <div className="font-medium">{String(m.metric_name)}</div>
                <div className="text-xs text-ink-muted">
                  {String(m.metric_type)} · סופי:{" "}
                  <span className="font-mono" dir="ltr">
                    {String(m.final_value)}
                  </span>
                </div>
              </button>
            ))}
          </div>
          <aside className="max-h-96 overflow-y-auto rounded-lg border border-border p-3 text-sm">
            {metric ? (
              <div className="space-y-2">
                <p className="font-medium">{String(metric.metric_name)}</p>
                <p className="text-xs">{String(metric.semantics_he || "")}</p>
                <p>
                  Final: <span className="font-mono">{String(metric.final_value)}</span>
                </p>
                {((metric.contributions as Array<Record<string, unknown>>) || []).map((c, i) => (
                  <div key={i} className="text-xs">
                    {String(c.class || "")} #{String(c.track_id)} → {String(c.delta)}
                    {c.rejection_he ? ` — ${String(c.rejection_he)}` : ""}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-ink-muted">בחרו מדד</p>
            )}
          </aside>
        </div>
      ) : null}

      {tab === "config" ? (
        <pre className="max-h-[480px] overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs" dir="ltr">
          {JSON.stringify(bundle.config, null, 2)}
        </pre>
      ) : null}

      <p className="text-[11px] text-ink-faint">למפתחים בלבד — לא מוצג במסכי המוצר.</p>
    </div>
  );
}
