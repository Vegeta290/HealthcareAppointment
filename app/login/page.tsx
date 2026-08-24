import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getServerSession } from "@/lib/serverSession";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { BrandMark } from "@/components/ui/BrandMark";
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
      <div className="mb-6 flex justify-center">
        <BrandMark size="lg" />
      </div>
      <Card>
        <CardHeader>
          <h1 className="text-lg font-semibold text-slate-900">Welcome back</h1>
          <p className="mt-0.5 text-sm text-slate-500">Sign in to your account</p>
        </CardHeader>
        <CardBody>
          <LoginForm />
          <p className="mt-4 text-center text-sm text-slate-500">
            New patient?{" "}
            <Link href="/register" className="font-medium text-brand-600 hover:underline">
              Register here
            </Link>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
