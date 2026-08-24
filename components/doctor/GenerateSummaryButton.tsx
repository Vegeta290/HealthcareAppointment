"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function GenerateSummaryButton({
  appointmentId,
  type,
  label,
}: {
  appointmentId: string;
  type: "PRE_VISIT" | "POST_VISIT";
  label: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/regenerate-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to trigger AI summary");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger AI summary");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" onClick={handleClick} disabled={submitting}>
        {submitting ? "Requesting…" : label}
      </Button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
