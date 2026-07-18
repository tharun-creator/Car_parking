'use client';

import { useState, useEffect, useRef } from 'react';
import { verifyAndCheckIn, getRecentScansAction } from '@/app/actions';
import { QrCode, Keyboard, AlertCircle, RefreshCw, X, CheckCircle, HelpCircle, History, UserCheck, UserX, Clock } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { ScanLogEntry } from '@/lib/sheets';

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
  const [logs, setLogs] = useState<ScanLogEntry[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const logsPerPage = 10;
  
  // Status Overlays
  const [resultOverlay, setResultOverlay] = useState<ScanResult | null>(null);
  const [isLocked, setIsLocked] = useState(false); // Debounce lock
  const isLockedRef = useRef(false); // Synchronous lock ref to prevent duplicate trigger races

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
          fps: 30, // Increased frame rate for faster scanning
          qrbox: (width: number, height: number) => {
            const size = Math.min(width, height) * 0.7;
            return { width: size, height: size };
          },
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true, // Use native hardware-accelerated BarcodeDetector API if supported
          },
        } as any,
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

  // Synthesize professional beep sounds using Web Audio API
  const playBeep = (type: 'verified' | 'already_checked_in' | 'not_found') => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'verified') {
        // High-pitch double chime (satisfying success sound)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        osc.start();
        gain.gain.setValueAtTime(0.08, ctx.currentTime + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.stop(ctx.currentTime + 0.35);
      } else if (type === 'already_checked_in') {
        // Double tone warning (lower pitch)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
        osc.frequency.setValueAtTime(349.23, ctx.currentTime + 0.1); // F4
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.stop(ctx.currentTime + 0.4);
      } else {
        // Buzzer (error sound)
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch (e) {
      console.warn('Web Audio API not supported or blocked by user gesture:', e);
    }
  };

  const handleLookup = async (params: { token?: string; code?: string; method: 'qr' | 'manual_code' }) => {
    // Prevent double scan / rate limit lookup using synchronous ref lock
    if (isLockedRef.current) return;
    isLockedRef.current = true;
    setIsLocked(true);
    setLoading(true);

    // Stop scanner camera immediately on successful read to prevent background scans
    if (params.method === 'qr') {
      await stopScanner();
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

        // Play outcome sound
        playBeep(response.outcome);

        // Vibrate device if supported based on scan outcome
        if (typeof window !== 'undefined' && window.navigator.vibrate) {
          if (response.outcome === 'verified') {
            window.navigator.vibrate([80, 50, 80]); // Quick double pulse
          } else if (response.outcome === 'already_checked_in') {
            window.navigator.vibrate([150, 100, 150]); // Longer warning pulses
          }
        }

        // Refresh the ledger list immediately
        fetchLogs();
      } else {
        playBeep('not_found');
        if (typeof window !== 'undefined' && window.navigator.vibrate) {
          window.navigator.vibrate(300); // Long single buzz
        }
        setErrorMsg(response.error || 'Check-in failed');
        isLockedRef.current = false;
        setIsLocked(false);
        if (params.method === 'qr') {
          startScanner();
        }
      }
    } catch (err) {
      console.error(err);
      playBeep('not_found');
      if (typeof window !== 'undefined' && window.navigator.vibrate) {
        window.navigator.vibrate(300);
      }
      setErrorMsg('Network error. Check connection and try again.');
      isLockedRef.current = false;
      setIsLocked(false);
      if (params.method === 'qr') {
        startScanner();
      }
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
    isLockedRef.current = false;
    setIsLocked(false);
    setErrorMsg(null);
    // Restart camera scanner after closing overlay details
    startScanner();
  };

  const fetchLogs = async (page: number = currentPage) => {
    try {
      const res = await getRecentScansAction(page, logsPerPage);
      if (res.success && res.logs && res.total !== undefined) {
        setLogs(res.logs);
        setTotalLogs(res.total);
        setCurrentPage(page);
      }
    } catch (e) {
      console.error('Error fetching logs:', e);
    }
  };

  // Auto-start scanner on load and fetch recent scan logs
  useEffect(() => {
    fetchLogs(1);
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
        {/* Column 1: QR Camera View */}
        <div className="glass-panel p-6 rounded-3xl flex flex-col justify-between items-center space-y-4 relative overflow-hidden">
          <div className="w-full flex items-center justify-between z-10">
            <div className="flex items-center gap-2">
              <QrCode className="text-emerald-400" size={20} />
              <span className="font-semibold text-sm">Camera Gate Scanner</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${scannerActive ? 'bg-emerald-500 animate-ping' : 'bg-slate-700'}`}></span>
              <span className="text-xs text-slate-400 font-medium">{scannerActive ? 'Scanning Live' : 'Camera Off'}</span>
            </div>
          </div>

          {/* HTML5 Qr Code Target Box with outcome border glow */}
          <div className={`w-full aspect-square bg-slate-950 rounded-2xl border-2 overflow-hidden flex items-center justify-center relative transition-all duration-300 ${
            resultOverlay?.outcome === 'verified'
              ? 'border-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.3)] ring-2 ring-emerald-500/20'
              : resultOverlay?.outcome === 'already_checked_in'
              ? 'border-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.3)] ring-2 ring-amber-500/20'
              : resultOverlay?.outcome === 'not_found' || errorMsg
              ? 'border-rose-500 shadow-[0_0_25px_rgba(244,63,94,0.3)] ring-2 ring-rose-500/20'
              : scannerActive
              ? 'border-slate-800'
              : 'border-slate-800'
          }`}>

            <div id={qrRegionId} className="w-full h-full object-cover"></div>
            
            {/* Viewfinder with GPay cutout & laser */}
            {scannerActive && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                {/* Dark Mask surrounding the viewfinder */}
                <div className="absolute inset-0 bg-slate-950/40"></div>
                
                {/* Viewfinder target box */}
                <div className="w-56 h-56 border-2 border-slate-700/50 rounded-2xl relative bg-transparent shadow-[0_0_0_9999px_rgba(15,23,42,0.45)]">
                  {/* Neon Glow Corners */}
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl -mt-1 -ml-1"></div>
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl -mt-1 -mr-1"></div>
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl -mb-1 -ml-1"></div>
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-xl -mb-1 -mr-1"></div>
                  
                  {/* Laser line scanner animation */}
                  <div className="absolute left-0 right-0 h-1 bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)] animate-laser"></div>
                </div>
              </div>
            )}

            {!scannerActive && (
              <button
                onClick={startScanner}
                className="absolute inset-0 bg-slate-900/90 hover:bg-slate-900 flex flex-col items-center justify-center gap-2 p-4 transition-colors z-20"
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

      {/* Scan History Ledger Panel */}
      <div className="glass-panel p-6 rounded-3xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="text-emerald-400" size={20} />
            <h2 className="font-bold text-base text-slate-100">Scan Activity Ledger</h2>
          </div>
          <button 
            onClick={fetchLogs} 
            className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-xl transition-all"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-900">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-900 text-slate-400 font-semibold">
                <th className="p-3">Time & Date</th>
                <th className="p-3">Identified Registrant</th>
                <th className="p-3">Method</th>
                <th className="p-3 text-right">Verification Outcome</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-500 font-medium">
                    No scan activity found yet. Start scanning to populate the ledger.
                  </td>
                </tr>
              ) : (
                logs.map((log, index) => {
                  const dateObj = new Date(log.timestamp);
                  const formattedTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const formattedDate = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
                  
                  return (
                    <tr key={index} className="border-b border-slate-900 bg-slate-900/10 hover:bg-slate-900/45 transition-colors">
                      <td className="p-3 text-slate-300 font-medium">
                        <div className="flex items-center gap-2">
                          <Clock size={13} className="text-slate-500" />
                          <span>{formattedDate}, {formattedTime}</span>
                        </div>
                      </td>
                      <td className="p-3 font-mono font-semibold text-slate-200">
                        {log.matched_email || log.raw_input || 'N/A'}
                      </td>
                      <td className="p-3 text-slate-400 font-medium capitalize">
                        {log.input_method === 'qr' ? 'QR Code' : 'Backup Code'}
                      </td>
                      <td className="p-3 text-right">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${
                          log.result === 'verified'
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            : log.result === 'already_checked_in'
                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                            : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                        }`}>
                          {log.result === 'verified' && <UserCheck size={11} />}
                          {log.result === 'already_checked_in' && <UserCheck size={11} />}
                          {log.result === 'not_found' && <UserX size={11} />}
                          {log.result === 'verified' && 'Verified'}
                          {log.result === 'already_checked_in' && 'Already Scanned'}
                          {log.result === 'not_found' && 'Not Found'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalLogs > logsPerPage && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-900 text-xs">
            <span className="text-slate-400 text-center sm:text-left">
              Showing {Math.min((currentPage - 1) * logsPerPage + 1, totalLogs)} - {Math.min(currentPage * logsPerPage, totalLogs)} of {totalLogs} scans
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={currentPage === 1 || loading}
                onClick={() => fetchLogs(currentPage - 1)}
                className="px-3 py-1.5 bg-slate-900 border border-slate-800 text-slate-300 hover:text-white rounded-xl disabled:opacity-40 disabled:hover:text-slate-300 transition-all font-semibold cursor-pointer disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-slate-300 font-medium whitespace-nowrap">
                Page {currentPage} of {Math.ceil(totalLogs / logsPerPage)}
              </span>
              <button
                type="button"
                disabled={currentPage >= Math.ceil(totalLogs / logsPerPage) || loading}
                onClick={() => fetchLogs(currentPage + 1)}
                className="px-3 py-1.5 bg-slate-900 border border-slate-800 text-slate-300 hover:text-white rounded-xl disabled:opacity-40 disabled:hover:text-slate-300 transition-all font-semibold cursor-pointer disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating GPay-Style Card Result Toast overlaying bottom half */}
      {resultOverlay && (
        <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs z-30 flex items-end p-4 rounded-3xl animate-fadeIn">
          <div className="w-full bg-slate-900/95 border border-slate-800 backdrop-blur-xl p-5 rounded-3xl shadow-2xl space-y-4 animate-slideUp">
            {/* Header with Close and Icon */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-2xl ${
                  resultOverlay.outcome === 'verified'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : resultOverlay.outcome === 'already_checked_in'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}>
                  {resultOverlay.outcome === 'verified' && <CheckCircle size={22} className="animate-bounce" />}
                  {resultOverlay.outcome === 'already_checked_in' && <AlertCircle size={22} />}
                  {resultOverlay.outcome === 'not_found' && <X size={22} />}
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">
                    {resultOverlay.outcome === 'verified' && 'Access Approved'}
                    {resultOverlay.outcome === 'already_checked_in' && 'Already Scanned'}
                    {resultOverlay.outcome === 'not_found' && 'Access Denied'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {resultOverlay.outcome === 'verified' && 'Pass verified successfully'}
                    {resultOverlay.outcome === 'already_checked_in' && 'Duplicate pass scan detected'}
                    {resultOverlay.outcome === 'not_found' && 'This pass is not registered'}
                  </p>
                </div>
              </div>
              <button
                onClick={closeOverlay}
                className="p-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all"
              >
                <X size={16} />
              </button>
            </div>

            {/* Details content */}
            {resultOverlay.outcome !== 'not_found' && (
              <div className="bg-slate-950/60 border border-slate-800/40 p-4 rounded-2xl space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Name</span>
                    <span className="text-sm font-semibold text-slate-100 block truncate">{resultOverlay.name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Role</span>
                    <span className="text-sm font-semibold text-emerald-400 block capitalize truncate">
                      {resultOverlay.role === 'other' ? resultOverlay.role_other_detail : resultOverlay.role}
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-900">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Email</span>
                    <span className="text-xs text-slate-300 block truncate">{resultOverlay.user_email}</span>
                  </div>
                  {resultOverlay.outcome === 'already_checked_in' && (
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-amber-500">First Scan</span>
                      <span className="text-xs text-slate-300 block truncate">
                        {resultOverlay.checked_in_at ? new Date(resultOverlay.checked_in_at).toLocaleTimeString() : ''} by {resultOverlay.checked_in_by}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Continue scanning / auto-resume footer */}
            <div className="flex justify-between items-center pt-2">
              <span className="text-[10px] text-slate-500">Scan paused. Ready to verify next.</span>
              <button
                onClick={closeOverlay}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl active:scale-[0.98] transition-all text-xs"
              >
                Continue Scanning
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
