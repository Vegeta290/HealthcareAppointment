import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getServerSession } from "@/lib/serverSession";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { BrandMark } from "@/components/ui/BrandMark";
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
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-6 flex justify-center">
        <BrandMark size="lg" />
      </div>
      <Card>
        <CardHeader>
          <h1 className="text-lg font-semibold text-slate-900">Create your account</h1>
          <p className="mt-0.5 text-sm text-slate-500">Register as a patient to start booking</p>
        </CardHeader>
        <CardBody>
          <RegisterForm />
          <p className="mt-4 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-brand-600 hover:underline">
              Sign in
            </Link>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
