"use client";

import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Field";

export function ScheduleDatePicker({ date }: { date: string }) {
  const router = useRouter();

  return (
    <Input
      type="date"
      value={date}
      className="max-w-xs"
      onChange={(e) => router.push(`/doctor/schedule?date=${e.target.value}`)}
    />
  );
}
