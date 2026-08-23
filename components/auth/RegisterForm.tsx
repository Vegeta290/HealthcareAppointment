"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/PageHeader";

export function RegisterForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          phone: phone || undefined,
          dateOfBirth: dateOfBirth || undefined,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Registration failed");
        return;
      }
      router.push("/patient/dashboard");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <FormField label="Full name" htmlFor="fullName">
        <Input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </FormField>
      <FormField label="Email" htmlFor="email">
        <Input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FormField>
      <FormField label="Phone (optional)" htmlFor="phone">
        <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </FormField>
      <FormField label="Date of birth (optional)" htmlFor="dateOfBirth">
        <Input
          id="dateOfBirth"
          type="date"
          max={new Date().toISOString().slice(0, 10)}
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
        />
      </FormField>
      <FormField label="Password" htmlFor="password">
        <Input
          id="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </FormField>
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
