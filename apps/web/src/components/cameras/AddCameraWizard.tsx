"use client";

import { Check, Film, Plus, Router, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ChoiceCard } from "@/components/rules/wizard/ChoiceCard";
import { ErrorBlock, LoadingBlock } from "@/components/ui/StateBlock";
import { t } from "@/i18n/he";
import { api } from "@/lib/api";
import { sourceTypeLabelHe, type AddCameraSourceChoice } from "@/lib/camera-source";
import { markSetupComplete } from "@/lib/setup-storage";
import type { VideoLabAsset } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useCatalog } from "@/providers/CatalogProvider";

type Step = "identity" | "source" | "pick_asset" | "checking" | "summary";

type Props = {
  /** After successful save — defaults to camera focus. */
  onDone?: (cameraId: string) => void;
  /** Embedded in setup — hide cancel that navigates away. */
  embedded?: boolean;
  onCancel?: () => void;
};

type CheckState = "idle" | "checking" | "ok" | "fail";

/**
 * Add Camera wizard — POC sources only (Video Lab). Network camera = coming soon.
 */
export function AddCameraWizard({ onDone, embedded = false, onCancel }: Props) {
  const { token } = useAuth();
  const { refresh } = useCatalog();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("identity");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [sourceChoice, setSourceChoice] = useState<AddCameraSourceChoice | null>(null);
  const [assets, setAssets] = useState<VideoLabAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [check, setCheck] = useState<CheckState>("idle");
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const selectedAsset = useMemo(
    () => assets.find((a) => a.id === selectedAssetId) ?? null,
    [assets, selectedAssetId],
  );

  const loadAssets = useCallback(async () => {
    if (!token) return;
    setAssetsLoading(true);
    setAssetsError(null);
    try {
      const list = await api.videoLab.list(token);
      setAssets(list);
    } catch {
      setAssetsError(t("errorLoad"));
    } finally {
      setAssetsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (step === "pick_asset") void loadAssets();
  }, [step, loadAssets]);

  useEffect(() => {
    let revoke: string | null = null;
    let cancelled = false;
    (async () => {
      if (!token || !selectedAssetId) {
        setPreviewUrl(null);
        return;
      }
      try {
        const blob = await api.videoLab.previewBlob(token, selectedAssetId);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        revoke = url;
        setPreviewUrl(url);
      } catch {
        if (!cancelled) setPreviewUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [token, selectedAssetId]);

  async function runConnectionCheck(assetId: string): Promise<boolean> {
    if (!token) return false;
    setCheck("checking");
    setCheckMessage(t("cameraCheckConnecting"));
    setStep("checking");
    try {
      const asset = await api.videoLab.get(token, assetId);
      if (!asset?.id) throw new Error("missing");
      // Readable = preview or video exists
      try {
        await api.videoLab.previewBlob(token, assetId);
      } catch {
        await api.videoLab.videoBlob(token, assetId);
      }
      setSelectedAssetId(asset.id);
      setCheck("ok");
      setCheckMessage(t("cameraCheckOk"));
      return true;
    } catch {
      setCheck("fail");
      setCheckMessage(t("cameraCheckFail"));
      return false;
    }
  }

  async function onUpload(file: File) {
    if (!token || !name.trim()) return;
    setUploading(true);
    setError(null);
    try {
      const asset = await api.videoLab.upload(token, file, name.trim(), location.trim() || undefined);
      setAssets((prev) => [asset, ...prev.filter((a) => a.id !== asset.id)]);
      setSelectedAssetId(asset.id);
      const ok = await runConnectionCheck(asset.id);
      if (ok) setStep("summary");
    } catch {
      setError(t("errorSave"));
    } finally {
      setUploading(false);
    }
  }

  async function onUseSelected() {
    if (!selectedAssetId) return;
    const ok = await runConnectionCheck(selectedAssetId);
    if (ok) setStep("summary");
  }

  async function onSave() {
    if (!token || !selectedAsset) return;
    setSaving(true);
    setError(null);
    try {
      const cam = await api.cameras.update(token, selectedAsset.camera_id, {
        name: name.trim(),
        location: location.trim() || null,
        enabled: true,
      });
      await refresh();
      const id = cam.id;
      markSetupComplete();
      if (onDone) onDone(id);
      else router.push(`/?camera=${id}`);
    } catch {
      setError(t("errorSave"));
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    if (onCancel) onCancel();
    else router.push("/");
  }

  return (
    <div className="mx-auto max-w-lg space-y-5" data-testid="add-camera-wizard" data-step={step}>
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-ink md:text-2xl">{t("addCamera")}</h1>
        <p className="text-sm text-ink-muted">{stepHint(step)}</p>
      </header>

      {step === "identity" ? (
        <section className="glass-panel space-y-4 rounded-xl p-4" data-testid="add-camera-identity">
          <Field label={t("cameraName")} value={name} onChange={setName} placeholder="שער ראשי" autoFocus />
          <Field
            label={`${t("cameraLocation")} (${t("optional")})`}
            value={location}
            onChange={setLocation}
            placeholder="חניה צפונית"
          />
          <div className="flex justify-between gap-2 pt-1">
            {!embedded ? (
              <Button variant="ghost" onClick={cancel}>
                {t("cancel")}
              </Button>
            ) : (
              <span />
            )}
            <Button
              onClick={() => setStep("source")}
              disabled={!name.trim()}
              data-testid="add-camera-continue"
            >
              {t("continue")}
            </Button>
          </div>
        </section>
      ) : null}

      {step === "source" ? (
        <section className="space-y-4" data-testid="add-camera-source">
          <h2 className="text-base font-medium text-ink">{t("cameraHowConnect")}</h2>
          <ul className="grid gap-2">
            <li>
              <ChoiceCard
                icon={Film}
                title={t("cameraSourceTestVideo")}
                description={t("cameraSourceTestVideoHint")}
                selected={sourceChoice === "video_lab"}
                onClick={() => setSourceChoice("video_lab")}
                testId="add-camera-source-video-lab"
              />
            </li>
            <li>
              <ChoiceCard
                icon={Router}
                title={t("cameraSourceNetwork")}
                description={t("cameraSourceNetworkSoon")}
                selected={false}
                disabled
                unavailableNote={t("comingSoon")}
                testId="add-camera-source-network"
              />
            </li>
          </ul>
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep("identity")}>
              {t("back")}
            </Button>
            <Button
              onClick={() => {
                if (sourceChoice === "video_lab") setStep("pick_asset");
              }}
              disabled={sourceChoice !== "video_lab"}
              data-testid="add-camera-source-continue"
            >
              {t("continue")}
            </Button>
          </div>
        </section>
      ) : null}

      {step === "pick_asset" ? (
        <section className="space-y-4" data-testid="add-camera-pick-asset">
          <h2 className="text-base font-medium text-ink">{t("cameraPickVideo")}</h2>
          {assetsLoading ? <LoadingBlock /> : null}
          {assetsError ? <ErrorBlock message={assetsError} onRetry={loadAssets} /> : null}
          {!assetsLoading && !assetsError ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {assets.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    aria-pressed={selectedAssetId === a.id}
                    onClick={() => setSelectedAssetId(a.id)}
                    data-testid="add-camera-asset-card"
                    className={`w-full overflow-hidden rounded-lg border text-start transition ${
                      selectedAssetId === a.id ? "border-accent ring-accent" : "border-border hover:border-border-strong"
                    }`}
                  >
                    <div className="aspect-video bg-muted" dir="ltr">
                      {selectedAssetId === a.id && previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-ink-faint">
                          <Film className="h-8 w-8" strokeWidth={1.5} aria-hidden />
                        </div>
                      )}
                    </div>
                    <div className="px-3 py-2">
                      <p className="truncate text-sm font-medium text-ink">{a.name_he}</p>
                      <p className="truncate text-[11px] text-ink-muted">{a.original_filename}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/*,.mp4"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUpload(f);
              e.target.value = "";
            }}
          />
          <Button
            variant="secondary"
            className="w-full"
            disabled={uploading || !name.trim()}
            onClick={() => fileRef.current?.click()}
            data-testid="add-camera-upload"
          >
            <Upload className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {uploading ? t("loading") : t("cameraUploadNew")}
          </Button>

          {error ? <p className="text-sm text-ink">{error}</p> : null}

          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep("source")}>
              {t("back")}
            </Button>
            <Button onClick={() => void onUseSelected()} disabled={!selectedAssetId} data-testid="add-camera-use-source">
              {t("cameraUseAsSource")}
            </Button>
          </div>
        </section>
      ) : null}

      {step === "checking" ? (
        <section className="glass-panel space-y-4 rounded-xl p-6 text-center" data-testid="add-camera-checking">
          {check === "checking" ? (
            <>
              <div className="mx-auto h-8 w-8 animate-pulse rounded-full bg-accent/30" />
              <p className="text-sm font-medium text-ink">{t("cameraCheckConnecting")}</p>
            </>
          ) : null}
          {check === "ok" ? (
            <>
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-success/20 text-success">
                <Check className="h-6 w-6" strokeWidth={2} aria-hidden />
              </span>
              <p className="text-sm font-medium text-ink">{checkMessage}</p>
              <Button onClick={() => setStep("summary")}>{t("continue")}</Button>
            </>
          ) : null}
          {check === "fail" ? (
            <>
              <p className="text-sm font-medium text-ink">{checkMessage}</p>
              <p className="text-xs text-ink-muted">{t("cameraCheckFailHint")}</p>
              <div className="flex justify-center gap-2">
                <Button variant="secondary" onClick={() => setStep("pick_asset")}>
                  {t("back")}
                </Button>
                <Button onClick={() => selectedAssetId && void runConnectionCheck(selectedAssetId)}>
                  {t("retry")}
                </Button>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {step === "summary" ? (
        <section className="space-y-4" data-testid="add-camera-summary">
          <h2 className="text-base font-medium text-ink">{t("cameraReadyTitle")}</h2>
          <div className="glass-panel overflow-hidden rounded-xl">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="" className="aspect-video w-full object-cover" dir="ltr" />
            ) : (
              <div className="flex aspect-video items-center justify-center bg-muted text-ink-faint">
                <Film className="h-10 w-10" strokeWidth={1.5} aria-hidden />
              </div>
            )}
            <dl className="grid gap-2 p-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-ink-muted">{t("cameraName")}</dt>
                <dd className="text-ink">{name.trim()}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">{t("cameraLocation")}</dt>
                <dd className="text-ink">{location.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">{t("cameraSourceLabel")}</dt>
                <dd className="text-ink">{sourceTypeLabelHe("video_lab")}</dd>
              </div>
            </dl>
          </div>
          {error ? <p className="text-sm text-ink">{error}</p> : null}
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep("pick_asset")}>
              {t("back")}
            </Button>
            <Button onClick={() => void onSave()} disabled={saving} data-testid="add-camera-save">
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
              {saving ? t("loading") : t("cameraAddCta")}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function stepHint(step: Step): string {
  switch (step) {
    case "identity":
      return "בחרו שם ומיקום למצלמה.";
    case "source":
      return "בחרו איך המצלמה מתחברת.";
    case "pick_asset":
      return "בחרו סרטון קיים או העלו חדש.";
    case "checking":
      return "בודקים שהמקור זמין.";
    case "summary":
      return "בדקו שהכול נכון לפני ההוספה.";
  }
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-ink-muted">{label}</label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
    </div>
  );
}
