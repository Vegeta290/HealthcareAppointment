"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";

export function EditDoctorNameForm({
  doctorId,
  currentName,
}: {
  doctorId: string;
  currentName: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(currentName ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs text-brand-600 hover:underline"
      >
        {currentName ? "Edit name" : "Set name"}
      </button>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/doctors/${doctorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save name");
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save name");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Priya Sharma"
        className="h-8 w-48 py-1 text-sm"
      />
      <Button type="submit" variant="secondary" disabled={submitting} className="h-8 px-2 py-1 text-xs">
        {submitting ? "Saving…" : "Save"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setEditing(false)}
        className="h-8 px-2 py-1 text-xs"
      >
        Cancel
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
