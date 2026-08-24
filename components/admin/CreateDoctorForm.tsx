"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Textarea } from "@/components/ui/Field";
import { Alert } from "@/components/ui/PageHeader";

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

export function CreateDoctorForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [specialisation, setSpecialisation] = useState("");
  const [bio, setBio] = useState("");
  const [slotDurationMinutes, setSlotDurationMinutes] = useState("30");
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleDay(day: number) {
    setWorkingDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/doctors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          password,
          specialisation,
          bio: bio || undefined,
          slotDurationMinutes: Number(slotDurationMinutes),
          workingHours: workingDays.map((weekday) => ({ weekday, startTime, endTime })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create doctor");

      setFullName("");
      setEmail("");
      setPassword("");
      setSpecialisation("");
      setBio("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create doctor");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Full name" htmlFor="doctorFullName">
          <Input
            id="doctorFullName"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Priya Sharma"
          />
        </FormField>
        <FormField label="Email" htmlFor="doctorEmail">
          <Input
            id="doctorEmail"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </FormField>
        <FormField label="Temporary password" htmlFor="doctorPassword">
          <Input
            id="doctorPassword"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormField>
        <FormField label="Specialisation" htmlFor="specialisation">
          <Input
            id="specialisation"
            required
            value={specialisation}
            onChange={(e) => setSpecialisation(e.target.value)}
            placeholder="Cardiology"
          />
        </FormField>
        <FormField label="Slot duration (minutes)" htmlFor="slotDuration">
          <Input
            id="slotDuration"
            type="number"
            min={5}
            step={5}
            value={slotDurationMinutes}
            onChange={(e) => setSlotDurationMinutes(e.target.value)}
          />
        </FormField>
      </div>

      <FormField label="Bio (optional)" htmlFor="bio">
        <Textarea id="bio" rows={2} value={bio} onChange={(e) => setBio(e.target.value)} />
      </FormField>

      <div>
        <p className="mb-1 text-sm font-medium text-slate-700">Working days</p>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((day) => (
            <label
              key={day.value}
              className={`cursor-pointer rounded-md border px-3 py-1 text-sm ${
                workingDays.includes(day.value)
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-slate-300 text-slate-600"
              }`}
            >
              <input
                type="checkbox"
                className="hidden"
                checked={workingDays.includes(day.value)}
                onChange={() => toggleDay(day.value)}
              />
              {day.label}
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Working hours start" htmlFor="startTime">
          <Input id="startTime" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </FormField>
        <FormField label="Working hours end" htmlFor="endTime">
          <Input id="endTime" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </FormField>
      </div>

      <Button type="submit" disabled={submitting}>
        {submitting ? "Creating…" : "Create doctor profile"}
      </Button>
    </form>
  );
}
