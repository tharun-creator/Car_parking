import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { isStaff } from '@/lib/sheets';
import { SignOutButton } from '@/components/SignOutButton';
import { ShieldCheck } from 'lucide-react';
import { ScanClient } from '@/components/ScanClient';
import Link from 'next/link';

export default async function ScanPage() {
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
      <header className="relative z-10 w-full max-w-4xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="bg-blue-500/10 border border-blue-500/30 p-2 rounded-xl text-blue-400">
            <ShieldCheck size={24} />
          </div>
          <div>
            <span className="font-bold text-lg tracking-wider text-blue-400 block font-display uppercase font-bold">Gatekeeper</span>
            <span className="text-xs text-slate-400 font-medium">Event Parking Scanner</span>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="px-4 py-2 text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-300 hover:text-white rounded-xl transition-colors"
          >
            Dashboard
          </Link>
          <SignOutButton />
        </div>
      </header>

      {/* Main scanner view */}
      <main className="relative z-10 w-full max-w-4xl mx-auto my-auto py-6">
        <ScanClient />
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full text-center py-2 text-xs text-slate-500">
        Signed in as {session.user.email} (Authorized Staff)
      </footer>
    </div>
  );
}

