"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/PageHeader";

export function LeaveForm({ doctorId }: { doctorId: string }) {
  const router = useRouter();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/doctor-leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId, startDate, endDate, reason: reason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to file leave");

      setStartDate("");
      setEndDate("");
      setReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to file leave");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Start date" htmlFor="leaveStart">
          <Input
            id="leaveStart"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </FormField>
        <FormField label="End date" htmlFor="leaveEnd">
          <Input
            id="leaveEnd"
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </FormField>
      </div>
      <FormField label="Reason (optional)" htmlFor="leaveReason">
        <Input id="leaveReason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </FormField>
      <p className="text-xs text-slate-500">
        Any existing appointments in this range will be cancelled automatically and the patient notified by
        email.
      </p>
      <Button type="submit" disabled={submitting}>
        {submitting ? "Filing…" : "File leave"}
      </Button>
    </form>
  );
}
