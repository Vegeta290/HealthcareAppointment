import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getServerSession } from "@/lib/serverSession";
import { Button } from "@/components/ui/Button";

const PORTAL_HOME: Record<Role, string> = {
  [Role.PATIENT]: "/patient/dashboard",
  [Role.DOCTOR]: "/doctor/schedule",
  [Role.ADMIN]: "/admin/doctors",
};

export default function HomePage() {
  const session = getServerSession();
  if (session) {
    redirect(PORTAL_HOME[session.role]);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">Healthcare Appointment Manager</h1>
      <p className="mt-2 text-sm text-slate-500">
        Book appointments, share symptoms in advance, and keep up with follow-ups.
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/login">
          <Button>Sign in</Button>
        </Link>
        <Link href="/register">
          <Button variant="secondary">Register as a patient</Button>
        </Link>
      </div>
    </div>
  );
}
