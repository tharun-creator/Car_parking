import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { isStaff } from '@/lib/sheets';
import { SignOutButton } from '@/components/SignOutButton';
import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import BulkQrInterface from '@/components/BulkQrInterface';


export default async function AdminBulkQrPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect('/');
  }

  const staff = await isStaff(session.user.email);
  if (!staff) {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-6 md:p-12 relative overflow-hidden">
      {/* Glow background */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Header */}
      <header className="relative z-10 w-full max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="bg-blue-500/10 border border-blue-500/30 p-2 rounded-xl text-blue-400">
            <ShieldCheck size={24} />
          </div>
          <div>
            <span className="font-bold text-base sm:text-lg tracking-wider text-blue-400 block font-display uppercase">Gatekeeper</span>
            <span className="text-[10px] sm:text-xs text-slate-400 font-medium">Event Parking Administration</span>
          </div>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/"
            className="px-3 py-1.5 sm:px-4 sm:py-2 text-[10px] sm:text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-300 hover:text-white rounded-xl transition-colors"
          >
            Dashboard
          </Link>
          <SignOutButton />
        </div>
      </header>

      {/* Main interface view */}
      <main className="relative z-10 w-full max-w-4xl mx-auto my-auto py-6">
        <BulkQrInterface />
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full text-center py-2 text-xs text-slate-500">
        Signed in as {session.user.email} (Authorized Administrator)
      </footer>
    </div>
  );
}
