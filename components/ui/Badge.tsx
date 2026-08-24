type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200",
  success: "bg-green-50 text-green-700 ring-1 ring-inset ring-green-200",
  warning: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  danger: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
  info: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
};

const dotClasses: Record<Tone, string> = {
  neutral: "bg-slate-400",
  success: "bg-green-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-blue-500",
};

export function Badge({
  tone = "neutral",
  dot = false,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClasses[tone]}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dotClasses[tone]}`} />}
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
  return (
    <Badge tone={APPOINTMENT_STATUS_TONE[status] ?? "neutral"} dot>
      {status.replace("_", " ")}
    </Badge>
  );
}

const URGENCY_TONE: Record<string, Tone> = {
  LOW: "success",
  MEDIUM: "warning",
  HIGH: "danger",
};

export function UrgencyBadge({ level }: { level: string }) {
  return (
    <Badge tone={URGENCY_TONE[level] ?? "neutral"} dot>
      {level} urgency
    </Badge>
  );
}
