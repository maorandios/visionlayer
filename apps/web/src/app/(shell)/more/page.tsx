"use client";

import Link from "next/link";
import { FlaskConical, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/providers/AuthProvider";
import { t } from "@/i18n/he";

export default function MorePage() {
  const { user, hub, logout } = useAuth();
  const simulateEnabled = hub?.features?.simulate_detections === true;
  const isDev =
    hub?.environment === "development" ||
    hub?.environment === "dev" ||
    hub?.environment === "local";

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold text-ink">{t("moreTitle")}</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-ink">{t("accountSection")}</h2>
        <Card>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-ink">
              <User className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </span>
            <div>
              <p className="text-xs text-ink-muted">{t("signedInAs")}</p>
              <p className="text-sm font-medium text-ink">{user?.username}</p>
            </div>
          </div>
        </Card>
        <Button variant="secondary" className="w-full gap-2" onClick={() => logout()}>
          <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {t("logout")}
        </Button>
      </section>

      {simulateEnabled && isDev ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-ink-muted">{t("devToolsSection")}</h2>
          <Card className="border-dashed">
            <div className="flex items-start gap-3">
              <FlaskConical className="mt-0.5 h-5 w-5 text-ink-muted" strokeWidth={1.75} aria-hidden />
              <div className="flex-1">
                <p className="text-sm font-medium text-ink">{t("devSimulate")}</p>
                <p className="mt-1 text-xs text-ink-muted">{t("devSimulateHint")}</p>
                <Link href="/dev/simulate" className="mt-3 inline-block">
                  <Button variant="secondary">{t("devSimulate")}</Button>
                </Link>
              </div>
            </div>
          </Card>
          {hub?.features?.video_lab === true ? (
            <Card className="border-dashed">
              <div className="flex items-start gap-3">
                <FlaskConical className="mt-0.5 h-5 w-5 text-ink-muted" strokeWidth={1.75} aria-hidden />
                <div className="flex-1">
                  <p className="text-sm font-medium text-ink">{t("videoLab")}</p>
                  <p className="mt-1 text-xs text-ink-muted">{t("videoLabHint")}</p>
                  <Link href="/dev/video-lab" className="mt-3 inline-block">
                    <Button variant="secondary">{t("videoLab")}</Button>
                  </Link>
                </div>
              </div>
            </Card>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
