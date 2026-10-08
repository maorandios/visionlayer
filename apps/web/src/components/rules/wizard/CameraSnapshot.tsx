"use client";

import { Camera as CameraIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { pointsToSvgPath, type Point } from "@/lib/polygon";
import type { Line, Zone } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";

const W = 640;
const H = 360;
const ACCENT = "var(--color-accent)";

const cache = new Map<string, Promise<string | null>>();

/** Object URL of the camera snapshot (cached per camera for the session). `null` when unavailable. */
export function useSnapshotUrl(cameraId: string | null | undefined): string | null | undefined {
  const { token } = useAuth();
  const [url, setUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!token || !cameraId) {
      setUrl(null);
      return;
    }
    let active = true;
    let p = cache.get(cameraId);
    if (!p) {
      p = api.cameras
        .snapshotBlob(token, cameraId)
        .then((blob) => URL.createObjectURL(blob))
        .catch(() => null);
      cache.set(cameraId, p);
    }
    p.then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [token, cameraId]);

  return url;
}

type Props = {
  cameraId: string | null | undefined;
  zone?: Pick<Zone, "points"> | null;
  line?: Pick<Line, "points"> | null;
  /** Highlight the full frame (used for "זוהה במצלמה"). */
  fullFrame?: boolean;
  className?: string;
  rounded?: string;
};

/** Camera frame with the selected zone / line drawn on top — the visual context of a rule. */
export function CameraSnapshot({ cameraId, zone, line, fullFrame = false, className = "", rounded = "rounded-lg" }: Props) {
  const url = useSnapshotUrl(cameraId);
  const a = line?.points?.[0];
  const b = line?.points?.[1];
  return (
    <div className={`relative overflow-hidden border border-border bg-muted ${rounded} ${className}`} dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} className="aspect-video w-full bg-canvas" aria-hidden>
        {url ? (
          <image href={url} x={0} y={0} width={W} height={H} preserveAspectRatio="xMidYMid slice" />
        ) : (
          <rect width={W} height={H} fill="#101722" />
        )}
        {fullFrame ? (
          <rect x={6} y={6} width={W - 12} height={H - 12} fill="rgba(255,106,43,0.08)" stroke={ACCENT} strokeWidth={3} rx={8} />
        ) : null}
        {zone && zone.points.length >= 3 ? (
          <path d={pointsToSvgPath(zone.points as Point[], W, H)} fill="rgba(255,106,43,0.18)" stroke={ACCENT} strokeWidth={2.5} />
        ) : null}
        {a && b ? (
          <>
            <line x1={a[0] * W} y1={a[1] * H} x2={b[0] * W} y2={b[1] * H} stroke={ACCENT} strokeWidth={3} strokeLinecap="round" />
            <circle cx={a[0] * W} cy={a[1] * H} r={6} fill="var(--color-canvas)" stroke={ACCENT} strokeWidth={2} />
            <circle cx={b[0] * W} cy={b[1] * H} r={6} fill="var(--color-canvas)" stroke={ACCENT} strokeWidth={2} />
          </>
        ) : null}
      </svg>
      {url === null ? (
        <span className="absolute inset-0 flex items-center justify-center text-ink-faint">
          <CameraIcon className="h-6 w-6" strokeWidth={1.5} aria-hidden />
        </span>
      ) : null}
    </div>
  );
}
