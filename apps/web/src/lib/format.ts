const OBJECT_HE: Record<string, string> = {
  person: "אדם",
  car: "רכב",
  truck: "משאית",
  bus: "אוטובוס",
  bicycle: "אופניים",
  motorcycle: "אופנוע",
  dog: "כלב",
  cat: "חתול",
};

const SEVERITY_HE: Record<string, string> = {
  info: "מידע",
  warning: "אזהרה",
  critical: "קריטי",
};

const STATE_HE: Record<string, string> = {
  new: "חדש",
  acknowledged: "אושר",
  resolved: "טופל",
};

export function objectClassHe(value: string | null | undefined): string {
  if (!value) return "—";
  return OBJECT_HE[value] ?? value;
}

export function severityHe(value: string | null | undefined): string {
  if (!value) return "—";
  return SEVERITY_HE[value] ?? value;
}

export function stateHe(value: string | null | undefined): string {
  if (!value) return "—";
  return STATE_HE[value] ?? value;
}

export function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("he-IL", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function cameraStatusHe(status: string): string {
  if (status === "online") return "מחוברת";
  if (status === "offline") return "מנותקת";
  return "לא ידוע";
}
