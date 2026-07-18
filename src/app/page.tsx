import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getRegistrationByEmail, isStaff } from '@/lib/sheets';
import { AuthPortal } from '@/components/AuthPortal';
import { SignOutButton } from '@/components/SignOutButton';
import { QrCode, LogOut, Layers } from 'lucide-react';

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (session?.user?.email) {
    const [staffStatus, registration] = await Promise.all([
      isStaff(session.user.email),
      getRegistrationByEmail(session.user.email),
    ]);

    // Non-staff redirection logic
    if (!staffStatus) {
      if (registration) {
        redirect('/my-code');
      } else {
        redirect('/register');
      }
    }

    // If staff, render the Vercel-like dashboard hub
    return (
      <div className="min-h-screen bg-black text-white flex flex-col justify-between p-6 max-w-lg mx-auto">
        {/* Header */}
        <header className="w-full flex items-center justify-between pb-6 border-b border-[#333]">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold tracking-wider uppercase text-sm">Gatekeeper</span>
            <span className="text-xs text-[#888]">/ Staff Hub</span>
          </div>
          <SignOutButton />
        </header>

        {/* Main Content */}
        <main className="my-auto py-10 space-y-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#111] border border-[#333] text-[10px] font-mono text-[#888]">
              Authorized Staff
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              Verification Portal
            </h1>
            <p className="text-[#888] text-xs">
              Signed in as <span className="text-white font-medium">{session.user.name}</span>.
            </p>
          </div>

          <div className="space-y-4">
            {/* Scan Gate Access */}
            <a
              href="/scan"
              className="vercel-card flex items-center justify-between p-4 hover:border-white transition-colors duration-150"
            >
              <div className="flex items-center gap-4">
                <div className="p-2 bg-[#111] border border-[#333] rounded-md text-white">
                  <QrCode size={18} />
                </div>
                <div className="text-left">
                  <span className="block text-sm font-semibold">Launch Scanner</span>
                  <span className="text-[11px] text-[#888]">Scan entry passes</span>
                </div>
              </div>
              <svg className="h-4 w-4 text-[#888]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>

            {/* Bulk QR Generator for Admin */}
            <a
              href="/admin/bulk-qr"
              className="vercel-card flex items-center justify-between p-4 hover:border-white transition-colors duration-150 border-blue-900/30 bg-blue-950/5"
            >
              <div className="flex items-center gap-4">
                <div className="p-2 bg-blue-950/40 border border-blue-900/40 rounded-md text-blue-400">
                  <Layers size={18} />
                </div>
                <div className="text-left">
                  <span className="block text-sm font-semibold text-blue-300">Bulk QR Generator</span>
                  <span className="text-[11px] text-blue-400/70">Create and download passes in ZIP</span>
                </div>
              </div>
              <svg className="h-4 w-4 text-blue-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>

            {/* View Personal Ticket or Register */}
            <a
              href={registration ? '/my-code' : '/register'}
              className="vercel-card flex items-center justify-between p-4 hover:border-white transition-colors duration-150"
            >
              <div className="flex items-center gap-4">
                <div className="p-2 bg-[#111] border border-[#333] rounded-md text-[#888]">
                  <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="text-left">
                  <span className="block text-sm font-semibold">
                    {registration ? 'Parking Pass' : 'Register Vehicle'}
                  </span>
                  <span className="text-[11px] text-[#888]">
                    {registration ? 'View your entry ticket' : 'Register vehicle credentials'}
                  </span>
                </div>
              </div>
              <svg className="h-4 w-4 text-[#888]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </main>

        {/* Footer */}
        <footer className="w-full text-center py-4 border-t border-[#111] text-[10px] text-[#888] font-mono flex flex-col items-center gap-1">
          <span>{session.user.email}</span>
          <span className="text-[9px] text-[#666]">Done by SPI Edge</span>
        </footer>
      </div>
    );
  }

  // Not logged in: Clean Vercel-like Landing Page
  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-between p-6 max-w-sm mx-auto">
      {/* Header */}
      <header className="w-full flex items-center gap-2 pb-6 border-b border-[#333]">
        <span className="font-mono font-bold tracking-wider uppercase text-sm">Gatekeeper</span>
        <span className="text-xs text-[#888]">/ Parking App</span>
      </header>

      {/* Main Content */}
      <main className="my-auto py-10 space-y-6">
        <div className="space-y-2 text-left">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#111] border border-[#333] text-[10px] font-mono text-[#888]">
            Vercel Platform
          </div>
          <h2 className="text-2xl font-bold tracking-tight">
            Event Parking <br />
            Registration
          </h2>
          <p className="text-[#888] text-xs leading-relaxed">
            Register your vehicle to obtain a secure QR ticket for entry.
          </p>
        </div>

        {/* Auth Portal */}
        <AuthPortal />
      </main>

      {/* Footer */}
      <footer className="w-full text-center text-[10px] text-[#888] font-mono">
        &copy; {new Date().getFullYear()} Gatekeeper. Done by SPI Edge.
      </footer>
    </div>
  );
}
