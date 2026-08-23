import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getServerSession } from "@/lib/serverSession";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { LoginForm } from "@/components/auth/LoginForm";

const PORTAL_HOME: Record<Role, string> = {
  [Role.PATIENT]: "/patient/dashboard",
  [Role.DOCTOR]: "/doctor/schedule",
  [Role.ADMIN]: "/admin/doctors",
};

export default function LoginPage() {
  const session = getServerSession();
  if (session) {
    redirect(PORTAL_HOME[session.role]);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <Card>
        <CardHeader>
          <h1 className="text-lg font-semibold text-slate-900">Sign in</h1>
        </CardHeader>
        <CardBody>
          <LoginForm />
          <p className="mt-4 text-center text-sm text-slate-500">
            New patient?{" "}
            <Link href="/register" className="text-brand-600 hover:underline">
              Register here
            </Link>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
