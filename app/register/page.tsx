import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getServerSession } from "@/lib/serverSession";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { RegisterForm } from "@/components/auth/RegisterForm";

const PORTAL_HOME: Record<Role, string> = {
  [Role.PATIENT]: "/patient/dashboard",
  [Role.DOCTOR]: "/doctor/schedule",
  [Role.ADMIN]: "/admin/doctors",
};

export default function RegisterPage() {
  const session = getServerSession();
  if (session) {
    redirect(PORTAL_HOME[session.role]);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <Card>
        <CardHeader>
          <h1 className="text-lg font-semibold text-slate-900">Register as a patient</h1>
        </CardHeader>
        <CardBody>
          <RegisterForm />
          <p className="mt-4 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link href="/login" className="text-brand-600 hover:underline">
              Sign in
            </Link>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
