"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Bell, HardDrive, Info, Server, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingBlock } from "@/components/ui/StateBlock";
import { Tabs } from "@/components/ui/Tabs";
import { t } from "@/i18n/he";
import { api } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";

type Section = "system" | "notifications" | "storage" | "users" | "about";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "system", label: t("settingsSystem") },
  { id: "notifications", label: t("settingsNotifications") },
  { id: "storage", label: t("settingsStorage") },
  { id: "users", label: t("settingsUsers") },
  { id: "about", label: t("settingsAbout") },
];

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border py-2 text-sm last:border-b-0">
      <span className="text-ink-muted">{label}</span>
      <span className="truncate text-ink" dir="ltr">
        {value}
      </span>
    </div>
  );
}

/** Placeholder for areas that exist in the product model but are hidden behind feature flags. */
function ComingSoon({ icon: Icon, hint }: { icon: typeof Bell; hint: string }) {
  return (
    <Card className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-ink">
        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink">{hint}</p>
        <Chip tone="dashed" className="mt-2">
          {t("settingsComingSoon")}
        </Chip>
      </div>
    </Card>
  );
}

function SettingsInner() {
  const { hub, user } = useAuth();
  const params = useSearchParams();
  const initial = (params.get("section") as Section | null) ?? "system";
  const [section, setSection] = useState<Section>(
    SECTIONS.some((s) => s.id === initial) ? initial : "system",
  );
  const features = hub?.features ?? {};

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title={t("settingsTitle")} />
      <Tabs items={SECTIONS} value={section} onChange={setSection} ariaLabel={t("settingsTitle")} />

      {section === "system" ? (
        <Card>
          <Row label={t("hubName")} value={hub?.name ?? "—"} />
          <Row label={t("hubEnvironment")} value={hub?.environment ?? "—"} />
          <Row label={t("apiAddress")} value={api.baseUrl} />
          <p className="mt-3 flex items-center gap-2 text-xs text-ink-muted">
            <Server className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {t("localNetworkOnly")}
          </p>
        </Card>
      ) : null}

      {section === "notifications" ? (
        features.push_notifications === true ? (
          <Card>
            <p className="text-sm text-ink">{t("notificationsHint")}</p>
          </Card>
        ) : (
          <ComingSoon icon={Bell} hint={t("notificationsHint")} />
        )
      ) : null}

      {section === "storage" ? <ComingSoon icon={HardDrive} hint={t("storageHint")} /> : null}

      {section === "users" ? (
        features.user_management === true ? (
          <Card>
            <Row label={t("username")} value={user?.username ?? "—"} />
          </Card>
        ) : (
          <div className="space-y-3">
            <Card>
              <Row label={t("signedInAs")} value={user?.username ?? "—"} />
            </Card>
            <ComingSoon icon={Users} hint={t("usersHint")} />
          </div>
        )
      ) : null}

      {section === "about" ? (
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Info className="h-4 w-4 text-ink-muted" strokeWidth={1.75} aria-hidden />
            <p className="text-sm font-medium text-ink">{t("appName")}</p>
          </div>
          <Row label={t("hubVersion")} value={hub?.version ?? "—"} />
          <Row label={t("hubEnvironment")} value={hub?.environment ?? "—"} />
          <p className="mt-3 text-xs text-ink-muted">{t("tagline")}</p>
        </Card>
      ) : null}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <SettingsInner />
    </Suspense>
  );
}
