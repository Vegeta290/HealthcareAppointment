"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Textarea } from "@/components/ui/Field";
import { Alert } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";

interface PrescriptionRow {
  key: string;
  medicationName: string;
  dosage: string;
  frequency: string;
  durationDays: string;
  instructions: string;
}

function emptyRow(): PrescriptionRow {
  return {
    key: crypto.randomUUID(),
    medicationName: "",
    dosage: "",
    frequency: "",
    durationDays: "",
    instructions: "",
  };
}

export function VisitNoteForm({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [rows, setRows] = useState<PrescriptionRow[]>([emptyRow()]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateRow(key: string, patch: Partial<PrescriptionRow>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((row) => row.key !== key));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!clinicalNotes.trim()) {
      setError("Clinical notes are required.");
      return;
    }
    const meaningfulRows = rows.filter((row) => row.medicationName.trim() || row.dosage.trim() || row.frequency.trim());
    const incomplete = meaningfulRows.find(
      (row) => !row.medicationName.trim() || !row.dosage.trim() || !row.frequency.trim()
    );
    if (incomplete) {
      setError("Each prescription row needs a medication name, dosage, and frequency.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/visit-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinicalNotes,
          prescriptions: meaningfulRows.map((row) => ({
            medicationName: row.medicationName,
            dosage: row.dosage,
            frequency: row.frequency,
            durationDays: row.durationDays ? Number(row.durationDays) : undefined,
            instructions: row.instructions || undefined,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save visit notes");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save visit notes");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <Alert>{error}</Alert>}

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-slate-900">Clinical notes</h2>
        </CardHeader>
        <CardBody>
          <FormField label="Notes from the visit" htmlFor="clinicalNotes">
            <Textarea
              id="clinicalNotes"
              rows={5}
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              placeholder="Findings, diagnosis, treatment plan..."
            />
          </FormField>
          <p className="mt-2 text-xs text-slate-500">
            A patient-friendly summary and follow-up steps will be generated automatically from these notes.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Prescription</h2>
          <Button type="button" variant="ghost" onClick={() => setRows((prev) => [...prev, emptyRow()])}>
            + Add medication
          </Button>
        </CardHeader>
        <CardBody className="space-y-4">
          {rows.map((row, index) => (
            <div key={row.key} className="grid gap-3 border-b border-slate-100 pb-4 last:border-0 last:pb-0 sm:grid-cols-5">
              <FormField label="Medication" htmlFor={`med-${row.key}`}>
                <Input
                  id={`med-${row.key}`}
                  value={row.medicationName}
                  onChange={(e) => updateRow(row.key, { medicationName: e.target.value })}
                  placeholder="Amoxicillin"
                />
              </FormField>
              <FormField label="Dosage" htmlFor={`dosage-${row.key}`}>
                <Input
                  id={`dosage-${row.key}`}
                  value={row.dosage}
                  onChange={(e) => updateRow(row.key, { dosage: e.target.value })}
                  placeholder="500mg"
                />
              </FormField>
              <FormField label="Frequency" htmlFor={`freq-${row.key}`}>
                <Input
                  id={`freq-${row.key}`}
                  value={row.frequency}
                  onChange={(e) => updateRow(row.key, { frequency: e.target.value })}
                  placeholder="Twice daily"
                />
              </FormField>
              <FormField label="Duration (days)" htmlFor={`duration-${row.key}`}>
                <Input
                  id={`duration-${row.key}`}
                  type="number"
                  min={1}
                  value={row.durationDays}
                  onChange={(e) => updateRow(row.key, { durationDays: e.target.value })}
                  placeholder="7"
                />
              </FormField>
              <div className="flex items-end gap-2">
                <FormField label="Instructions" htmlFor={`instr-${row.key}`}>
                  <Input
                    id={`instr-${row.key}`}
                    value={row.instructions}
                    onChange={(e) => updateRow(row.key, { instructions: e.target.value })}
                    placeholder="After food"
                  />
                </FormField>
                {rows.length > 1 && (
                  <Button type="button" variant="ghost" onClick={() => removeRow(row.key)}>
                    Remove
                  </Button>
                )}
              </div>
              {index < rows.length - 1 && <div className="sm:hidden" />}
            </div>
          ))}
        </CardBody>
      </Card>

      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving…" : "Complete visit"}
      </Button>
    </form>
  );
}
