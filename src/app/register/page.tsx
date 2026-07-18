import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getRegistrationByEmail } from '@/lib/sheets';
import { RegistrationForm } from '@/components/RegistrationForm';
import { SignOutButton } from '@/components/SignOutButton';
import { Car } from 'lucide-react';

export default async function RegisterPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect('/');
  }

  // Double check if already registered. If yes, redirect to code.
  const existing = await getRegistrationByEmail(session.user.email);
  if (existing) {
    redirect('/my-code');
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-6 md:p-12 relative overflow-hidden">
      {/* Decorative glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Header */}
      <header className="relative z-10 w-full max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="bg-emerald-500/10 border border-emerald-500/30 p-2 rounded-xl text-emerald-400">
            <Car size={24} />
          </div>
          <div>
            <span className="font-bold text-base sm:text-lg tracking-wider text-emerald-400 block font-display uppercase">Gatekeeper</span>
            <span className="text-[10px] sm:text-xs text-slate-400 font-medium">Event Parking System</span>
          </div>
        </div>
        <SignOutButton />
      </header>

      {/* Main Form container */}
      <main className="relative z-10 w-full max-w-md mx-auto my-auto py-8">
        <div className="glass-panel p-8 rounded-3xl shadow-2xl shadow-black/80 space-y-6">
          <div className="space-y-1.5 text-center sm:text-left">
            <h2 className="text-2xl font-bold font-display text-white">Vehicle Registration</h2>
            <p className="text-slate-400 text-xs">
              Complete the details below to register your vehicle for parking.
            </p>
          </div>

          <RegistrationForm />
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full text-center py-2 text-xs text-slate-500">
        Signed in as {session.user.email}
      </footer>
    </div>
  );
}
