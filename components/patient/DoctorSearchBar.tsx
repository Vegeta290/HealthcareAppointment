"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";

export function DoctorSearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("specialisation") ?? "");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (value.trim()) params.set("specialisation", value.trim());
    router.push(`/patient/doctors${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        placeholder="Search by specialisation (e.g. Cardiology)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="max-w-sm"
      />
      <Button type="submit" variant="secondary">
        Search
      </Button>
    </form>
  );
}
