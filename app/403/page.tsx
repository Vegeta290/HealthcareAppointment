import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function ForbiddenPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">Access denied</h1>
      <p className="mt-2 text-sm text-slate-500">
        Your account doesn&apos;t have permission to view that page.
      </p>
      <Link href="/" className="mt-6">
        <Button variant="secondary">Back to home</Button>
      </Link>
    </div>
  );
}
