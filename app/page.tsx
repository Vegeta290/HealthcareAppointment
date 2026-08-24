import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getServerSession } from "@/lib/serverSession";
import { Button } from "@/components/ui/Button";
import { BrandMark } from "@/components/ui/BrandMark";

const PORTAL_HOME: Record<Role, string> = {
  [Role.PATIENT]: "/patient/dashboard",
  [Role.DOCTOR]: "/doctor/schedule",
  [Role.ADMIN]: "/admin/doctors",
};

const FEATURES = [
  {
    title: "Book in minutes",
    description: "Search by specialisation, pick an open slot, and share your symptoms up front.",
  },
  {
    title: "AI-prepared visits",
    description: "Your doctor sees a summarised urgency and chief complaint before you walk in.",
  },
  {
    title: "Stay in sync",
    description: "Confirmations, reminders, and reschedules land in your inbox and calendar automatically.",
  },
];

export default function HomePage() {
  const session = getServerSession();
  if (session) {
    redirect(PORTAL_HOME[session.role]);
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 flex justify-center blur-3xl"
      >
        <div className="aspect-[1155/678] w-[72rem] bg-gradient-to-tr from-brand-200 via-brand-100 to-transparent opacity-50" />
      </div>

      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-4 py-16 text-center">
        <BrandMark size="lg" />
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          Healthcare Appointment Manager
        </h1>
        <p className="mt-3 max-w-xl text-base text-slate-600">
          Book appointments, share symptoms in advance, and keep up with follow-ups — for patients,
          doctors, and clinic admins alike.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/login">
            <Button className="px-6 py-2.5">Sign in</Button>
          </Link>
          <Link href="/register">
            <Button variant="secondary" className="px-6 py-2.5">
              Register as a patient
            </Button>
          </Link>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-slate-200 bg-white/70 p-5 text-left shadow-card backdrop-blur-sm"
            >
              <p className="text-sm font-semibold text-slate-900">{feature.title}</p>
              <p className="mt-1.5 text-sm text-slate-500">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
