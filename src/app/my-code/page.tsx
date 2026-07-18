import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getRegistrationByEmail } from '@/lib/sheets';
import { SignOutButton } from '@/components/SignOutButton';
import QRCode from 'qrcode';
import { Car, Download, Shield, Sparkles, UserCheck } from 'lucide-react';
import Link from 'next/link';

import PdfDownloadButton from '@/components/PdfDownloadButton';

export default async function MyCodePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect('/');
  }

  const registration = await getRegistrationByEmail(session.user.email);
  if (!registration) {
    redirect('/register');
  }

  // Generate QR Code data URL on-the-fly server-side
  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(registration.qr_token, {
      margin: 3,
      width: 400,
      color: {
        dark: '#020617', // slate-950 (perfect dark contrast)
        light: '#ffffff', // pure white (essential for scanning)
      },
    });
  } catch (err) {
    console.error('Error generating QR code:', err);
  }

  const isCheckedIn = registration.status === 'checked_in';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-6 md:p-12 relative overflow-hidden">
      {/* Decorative glows */}
      <div className={`absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 ${isCheckedIn ? 'bg-amber-500/10' : 'bg-emerald-500/10'} rounded-full blur-[100px] pointer-events-none`}></div>

      {/* Header */}
      <header className="relative z-10 w-full max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="bg-emerald-500/10 border border-emerald-500/30 p-2 rounded-xl text-emerald-400">
            <Car size={24} />
          </div>
          <div>
            <span className="font-bold text-base sm:text-lg tracking-wider text-emerald-400 block font-display uppercase">Gatekeeper</span>
            <span className="text-[10px] sm:text-xs text-slate-400 font-medium">Event Parking System</span>
          </div>
        </Link>
        <SignOutButton />
      </header>

      {/* Main QR Code Ticket Screen */}
      <main className="relative z-10 w-full max-w-md mx-auto my-auto py-6">
        <div className="glass-panel p-6 sm:p-8 rounded-3xl shadow-2xl shadow-black/80 space-y-6 text-center">
          {/* Checked In Banner */}
          {isCheckedIn ? (
            <div className="py-2.5 px-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 mx-auto">
              <UserCheck size={14} /> Checked In at Gate
            </div>
          ) : (
            <div className="py-2.5 px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 mx-auto animate-pulse">
              <Sparkles size={14} /> Registered & Active
            </div>
          )}

          <div className="space-y-1">
            <h2 className="text-2xl font-bold font-display text-white">{registration.name}</h2>
            <p className="text-xs text-slate-400 font-medium tracking-wide uppercase">
              Role: <span className="text-slate-200">{registration.role === 'other' ? registration.role_other_detail : registration.role}</span>
            </p>
          </div>

          {/* QR Code Wrapper with clean white border box */}
          <div className="mx-auto w-64 h-64 p-3 bg-white rounded-3xl shadow-xl shadow-black/40 flex items-center justify-center border-4 border-slate-900">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt="Parking Access QR Code"
                className="w-full h-full object-contain rounded-xl"
              />
            ) : (
              <div className="text-slate-900 text-xs font-semibold">Generating QR Code...</div>
            )}
          </div>

          {/* Backup Code Display */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 max-w-xs mx-auto space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 block">Backup Entry Code</span>
            <span className="text-3xl font-black font-mono tracking-widest text-white uppercase block select-all">
              {registration.backup_code}
            </span>
          </div>

          <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
            Present this QR code or backup code to staff at the entry gate.
          </p>

          {/* Download PDF Action Button */}
          {qrDataUrl && (
            <PdfDownloadButton
              registration={{
                name: registration.name,
                role: registration.role,
                role_other_detail: registration.role_other_detail,
                user_email: registration.user_email,
                phone_number: registration.phone_number,
                backup_code: registration.backup_code
              }}
              qrDataUrl={qrDataUrl}
            />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full text-center py-2 text-xs text-slate-500">
        Signed in as {session.user.email}
      </footer>
    </div>
  );
}
