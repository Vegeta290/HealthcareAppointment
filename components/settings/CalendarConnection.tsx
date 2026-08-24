"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/PageHeader";

export function ConnectCalendarButton() {
  return (
    <a href="/api/integrations/google-calendar/authorize">
      <Button>Connect Google Calendar</Button>
    </a>
  );
}

export function DisconnectCalendarButton() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDisconnect() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/google-calendar/disconnect", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to disconnect");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      {error && <Alert>{error}</Alert>}
      <Button variant="secondary" onClick={handleDisconnect} disabled={submitting}>
        {submitting ? "Disconnecting…" : "Disconnect"}
      </Button>
    </div>
  );
}
