type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  success: "bg-green-100 text-green-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-800",
  info: "bg-blue-100 text-blue-800",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}

const APPOINTMENT_STATUS_TONE: Record<string, Tone> = {
  PENDING: "warning",
  CONFIRMED: "info",
  CANCELLED: "danger",
  COMPLETED: "success",
  NO_SHOW: "neutral",
};

export function AppointmentStatusBadge({ status }: { status: string }) {
  return <Badge tone={APPOINTMENT_STATUS_TONE[status] ?? "neutral"}>{status.replace("_", " ")}</Badge>;
}

const URGENCY_TONE: Record<string, Tone> = {
  LOW: "success",
  MEDIUM: "warning",
  HIGH: "danger",
};

export function UrgencyBadge({ level }: { level: string }) {
  return <Badge tone={URGENCY_TONE[level] ?? "neutral"}>{level} urgency</Badge>;
}
