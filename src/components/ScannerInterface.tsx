'use client';

import { useState, useEffect, useRef } from 'react';
import { verifyAndCheckIn } from '@/app/actions';
import { QrCode, Keyboard, AlertCircle, RefreshCw, X, CheckCircle, HelpCircle } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

interface ScanResult {
  outcome: 'verified' | 'already_checked_in' | 'not_found';
  name?: string;
  role?: string;
  role_other_detail?: string;
  user_email?: string;
  checked_in_at?: string;
  checked_in_by?: string;
}

export default function ScannerInterface() {
  const [manualCode, setManualCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Status Overlays
  const [resultOverlay, setResultOverlay] = useState<ScanResult | null>(null);
  const [isLocked, setIsLocked] = useState(false); // Debounce lock

  const qrRegionId = 'qr-reader-target';
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  // Monitor network status
  const [isOnline, setIsOnline] = useState(() => typeof window !== 'undefined' ? window.navigator.onLine : true);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  // Initialize html5-qrcode
  useEffect(() => {
    // Only in browser
    html5QrCodeRef.current = new Html5Qrcode(qrRegionId);

    return () => {
      // Clean up scanner on unmount
      if (html5QrCodeRef.current?.isScanning) {
        html5QrCodeRef.current.stop().catch(console.error);
      }
    };
  }, []);

  const startScanner = async () => {
    if (!html5QrCodeRef.current) return;
    setErrorMsg(null);

    try {
      setScannerActive(true);
      await html5QrCodeRef.current.start(
        { facingMode: 'environment' }, // Rear camera
        {
          fps: 10,
          qrbox: (width, height) => {
            const size = Math.min(width, height) * 0.7;
            return { width: size, height: size };
          },
        },
        async (decodedText) => {
          // On Success scan
          if (decodedText) {
            handleLookup({ token: decodedText, method: 'qr' });
          }
        },
        () => {
          // silent failure on every frames search
        }
      );
      setCameraPermission(true);
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Camera start error:', error);
      setScannerActive(false);
      if (error?.toString().toLowerCase().includes('permission')) {
        setCameraPermission(false);
        setErrorMsg('Camera permission denied. Please allow camera access in browser settings.');
      } else {
        setErrorMsg('Could not access rear camera. Ensure no other app is using it.');
      }
    }
  };

  const stopScanner = async () => {
    if (html5QrCodeRef.current?.isScanning) {
      try {
        await html5QrCodeRef.current.stop();
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
    }
    setScannerActive(false);
  };

  const handleLookup = async (params: { token?: string; code?: string; method: 'qr' | 'manual_code' }) => {
    // Prevent double scan / rate limit lookup
    if (isLocked) return;
    setIsLocked(true);
    setLoading(true);

    // Stop scanning while displaying result overlay to avoid double reads
    if (scannerActive) {
      await stopScanner();
    }

    // Vibrate device if supported
    if (typeof window !== 'undefined' && window.navigator.vibrate) {
      window.navigator.vibrate(100);
    }

    try {
      const response = await verifyAndCheckIn(params);

      if (response.success && response.outcome) {
        setResultOverlay({
          outcome: response.outcome,
          name: response.name,
          role: response.role,
          role_other_detail: response.role_other_detail,
          user_email: response.user_email,
          checked_in_at: response.checked_in_at,
          checked_in_by: response.checked_in_by,
        });

        // Auto-close overlay after 3.5 seconds and restart scanner
        setTimeout(() => {
          closeOverlay();
        }, 3500);
      } else {
        setErrorMsg(response.error || 'Check-in failed');
        setIsLocked(false);
        // Restart scanner on error
        startScanner();
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Network error. Check connection and try again.');
      setIsLocked(false);
      // Restart scanner on network error
      startScanner();
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    if (manualCode.trim().length !== 4) {
      setErrorMsg('Manual entry code must be exactly 4 characters.');
      return;
    }
    handleLookup({ code: manualCode.trim().toUpperCase(), method: 'manual_code' });
    setManualCode('');
  };

  const closeOverlay = () => {
    setResultOverlay(null);
    setIsLocked(false);
    setErrorMsg(null);
    // Restart scanner
    startScanner();
  };

  // Auto-start scanner on load
  useEffect(() => {
    const timer = setTimeout(() => {
      startScanner();
    }, 0);
    return () => {
      clearTimeout(timer);
      stopScanner();
    };
  }, []);

  return (
    <div className="space-y-6 relative">
      {/* Network Blip State */}
      {!isOnline && (
        <div className="p-3 bg-amber-500/20 border border-amber-500/40 rounded-2xl flex items-center justify-center gap-2 text-amber-400 text-xs font-semibold animate-pulse">
          <RefreshCw size={14} className="animate-spin" />
          <span>Connection Lost. Scanner will queue requests once reconnected.</span>
        </div>
      )}

      {/* Errors Alert */}
      {errorMsg && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start justify-between gap-3 text-rose-400 text-sm">
          <div className="flex gap-2.5 items-start">
            <AlertCircle className="shrink-0 mt-0.5" size={18} />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Column 1: QR Camera View */}
        <div className="glass-panel p-6 rounded-3xl flex flex-col justify-between items-center space-y-4">
          <div className="w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <QrCode className="text-emerald-400" size={20} />
              <span className="font-semibold text-sm">Camera Gate Scanner</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${scannerActive ? 'bg-emerald-500 animate-ping' : 'bg-slate-700'}`}></span>
              <span className="text-xs text-slate-400 font-medium">{scannerActive ? 'Scanning Live' : 'Camera Off'}</span>
            </div>
          </div>

          {/* HTML5 Qr Code Target Box */}
          <div className="w-full aspect-square bg-slate-950 rounded-2xl border-2 border-dashed border-slate-800 overflow-hidden flex items-center justify-center relative">
            <div id={qrRegionId} className="w-full h-full object-cover"></div>
            
            {/* Overlay Grid lines inside scanner */}
            {scannerActive && (
              <div className="absolute inset-0 border-[32px] border-black/40 pointer-events-none flex items-center justify-center">
                <div className="w-48 h-48 border-2 border-emerald-500/60 rounded-xl relative">
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-emerald-400 -mt-1 -ml-1"></div>
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-emerald-400 -mt-1 -mr-1"></div>
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-emerald-400 -mb-1 -ml-1"></div>
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-emerald-400 -mb-1 -mr-1"></div>
                  <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-emerald-500/80 animate-bounce"></div>
                </div>
              </div>
            )}

            {!scannerActive && (
              <button
                onClick={startScanner}
                className="absolute inset-0 bg-slate-900/90 hover:bg-slate-900 flex flex-col items-center justify-center gap-2 p-4 transition-colors"
              >
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
                  <RefreshCw size={24} />
                </div>
                <span className="text-xs font-semibold text-white">Restart Rear Camera</span>
                <span className="text-[10px] text-slate-500">Requires camera permissions</span>
              </button>
            )}
          </div>
        </div>

        {/* Column 2: Manual Code Input */}
        <div className="glass-panel p-6 rounded-3xl flex flex-col justify-between space-y-4">
          <div className="flex items-center gap-2">
            <Keyboard className="text-blue-400" size={20} />
            <span className="font-semibold text-sm">Manual Code Entry</span>
          </div>

          <form onSubmit={handleManualSubmit} className="space-y-4 my-auto">
            <div className="space-y-2">
              <label htmlFor="manualCode" className="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest text-center">
                Type 4-Character backup code
              </label>
              <input
                type="text"
                id="manualCode"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase().slice(0, 4))}
                placeholder="A3X9"
                disabled={loading}
                className="w-full text-center py-4 bg-slate-950/80 border border-slate-800 focus:border-blue-500/80 rounded-2xl text-4xl font-mono font-black tracking-widest uppercase text-white outline-none focus:ring-1 focus:ring-blue-500/30 transition-all duration-200"
              />
            </div>

            <button
              type="submit"
              disabled={loading || manualCode.trim().length !== 4}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold rounded-2xl active:scale-[0.98] transition-all duration-200 text-base"
            >
              {loading ? 'Confirming...' : 'Verify Entry'}
            </button>
          </form>

          <div className="text-[10px] text-slate-500 text-center leading-relaxed">
            Use backup code when the QR is damaged, glare is high, or screen is cracked.
          </div>
        </div>
      </div>

      {/* Lookup State Overlay (Fixed full-screen) */}
      {resultOverlay && (
        <div
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 transition-all duration-300 ${
            resultOverlay.outcome === 'verified'
              ? 'bg-emerald-950 text-emerald-100'
              : resultOverlay.outcome === 'already_checked_in'
              ? 'bg-amber-950 text-amber-100'
              : 'bg-rose-950 text-rose-100'
          }`}
        >
          {/* Main Overlay Box */}
          <div className="text-center max-w-md w-full space-y-8 animate-scaleIn">
            {/* Status Icon */}
            <div className="mx-auto w-24 h-24 rounded-full flex items-center justify-center bg-white/10 border-4 border-white/20">
              {resultOverlay.outcome === 'verified' && <CheckCircle size={56} className="text-emerald-400" />}
              {resultOverlay.outcome === 'already_checked_in' && <AlertCircle size={56} className="text-amber-400" />}
              {resultOverlay.outcome === 'not_found' && <X size={56} className="text-rose-400" />}
            </div>

            {/* Status Text Banner */}
            <div className="space-y-2">
              <h1 className="text-5xl font-black font-display tracking-wider uppercase">
                {resultOverlay.outcome === 'verified' && 'VERIFIED'}
                {resultOverlay.outcome === 'already_checked_in' && 'ALREADY IN'}
                {resultOverlay.outcome === 'not_found' && 'NOT REGISTERED'}
              </h1>
              <p className="text-sm font-medium tracking-wide uppercase opacity-75">
                {resultOverlay.outcome === 'verified' && 'Gate access approved'}
                {resultOverlay.outcome === 'already_checked_in' && 'Duplicate ticket scan'}
                {resultOverlay.outcome === 'not_found' && 'This person is not registered'}
              </p>
            </div>

            {/* Registrant Meta Details */}
            {resultOverlay.outcome !== 'not_found' && (
              <div className="glass-panel p-6 rounded-3xl space-y-3 bg-black/35 text-left border-white/10">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider opacity-60 block">Full Name</span>
                  <span className="text-xl font-bold text-white block">{resultOverlay.name}</span>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider opacity-60 block">Role</span>
                    <span className="text-sm font-semibold text-white capitalize block">
                      {resultOverlay.role === 'other' ? resultOverlay.role_other_detail : resultOverlay.role}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider opacity-60 block">Email</span>
                    <span className="text-xs font-semibold text-slate-200 block truncate">{resultOverlay.user_email}</span>
                  </div>
                </div>

                {resultOverlay.outcome === 'already_checked_in' && (
                  <div className="pt-2 mt-2 border-t border-white/10">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400 block">First Checked In At</span>
                    <span className="text-xs font-medium text-white block">
                      {resultOverlay.checked_in_at ? new Date(resultOverlay.checked_in_at).toLocaleTimeString() : 'N/A'} (by {resultOverlay.checked_in_by})
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Close / Action bar */}
            <button
              onClick={closeOverlay}
              className="px-8 py-3 bg-white hover:bg-slate-100 text-slate-950 font-bold rounded-2xl active:scale-[0.98] transition-all text-sm"
            >
              Continue Scanning
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
