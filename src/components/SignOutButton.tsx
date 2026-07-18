'use client';

import { signOut } from 'next-auth/react';
import { useState } from 'react';
import { LogOut } from 'lucide-react';

export function SignOutButton({ className }: { className?: string }) {
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    await signOut({ callbackUrl: '/' });
  };

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      className={className || "px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium text-slate-400 hover:text-white bg-slate-900/60 hover:bg-slate-900 border border-slate-800 rounded-xl transition-all duration-200 flex items-center gap-1.5 sm:gap-2"}
    >
      <LogOut size={16} />
      {loading ? 'Signing out...' : 'Sign Out'}
    </button>
  );
}
