'use client';

import { useState, useEffect, useRef } from 'react';
import { verifyAndCheckIn, getRecentScansAction } from '@/app/actions';
import { QrCode, Keyboard, AlertCircle, RefreshCw, X, CheckCircle, History, UserCheck, UserX, Clock } from 'lucide-react';
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
  
  // Continuous Scan States
  const [lastScan, setLastScan] = useState<(ScanResult & { id: string }) | null>(null);
  const scannedCooldowns = useRef<Map<string, number>>(new Map());

  const lastScanRef = useRef<any>(null);
  const loadingRef = useRef<boolean>(false);

  useEffect(() => {
    lastScanRef.current = lastScan;
  }, [lastScan]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

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
    html5QrCodeRef.current = new Html5Qrcode(qrRegionId);

    return () => {
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
          fps: 30, // High frame rate for instant scans
          qrbox: (width: number, height: number) => {
            const size = Math.min(width, height) * 0.85; // Increased to 85% for easier mobile capture and faster focus
            return { width: size, height: size };
          },
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true, // Hardware acceleration
          },
        } as any,
        async (decodedText) => {
          if (decodedText) {
            // Ignore scan frames if status overlay is already showing or loading is in progress
            if (lastScanRef.current || loadingRef.current) {
              return;
            }
            const now = Date.now();
            const lastTime = scannedCooldowns.current.get(decodedText);
            
            // Limit scanning the exact same code to once per 3 seconds
            if (lastTime && now - lastTime < 3000) {
              return;
            }
            scannedCooldowns.current.set(decodedText, now);
            handleLookupContinuous({ token: decodedText, method: 'qr' });
          }
        },
        () => {
          // silent failure on empty frames
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

  const playBeep = (type: 'verified' | 'already_checked_in' | 'not_found') => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'verified') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        osc.start();
        gain.gain.setValueAtTime(0.08, ctx.currentTime + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.stop(ctx.currentTime + 0.35);
      } else if (type === 'already_checked_in') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(349.23, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.stop(ctx.currentTime + 0.4);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch (e) {
      console.warn('Audio feedback blocked by user gesture:', e);
    }
  };

  const handleLookupContinuous = async (params: { token?: string; code?: string; method: 'qr' | 'manual_code' }) => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const response = await verifyAndCheckIn(params);

      if (response.success && response.outcome) {
        const scanId = Math.random().toString(36).substring(2, 9);
        const result: ScanResult & { id: string } = {
          id: scanId,
          outcome: response.outcome,
          name: response.name,
          role: response.role,
          role_other_detail: response.role_other_detail,
          user_email: response.user_email,
          checked_in_at: response.checked_in_at,
          checked_in_by: response.checked_in_by,
        };

        setLastScan(result);
        playBeep(response.outcome);

        if (typeof window !== 'undefined' && window.navigator.vibrate) {
          if (response.outcome === 'verified') {
            window.navigator.vibrate([80, 50, 80]);
          } else if (response.outcome === 'already_checked_in') {
            window.navigator.vibrate([150, 100, 150]);
          }
        }

        // Auto-remove overlay after 2 seconds for faster scanning
        setTimeout(() => {
          setLastScan(prev => prev?.id === scanId ? null : prev);
        }, 2000);

        fetchLogs();
      } else {
        playBeep('not_found');
        if (typeof window !== 'undefined' && window.navigator.vibrate) {
          window.navigator.vibrate(300);
        }
        
        const scanId = Math.random().toString(36).substring(2, 9);
        setLastScan({
          id: scanId,
          outcome: 'not_found'
        });
        
        setTimeout(() => {
          setLastScan(prev => prev?.id === scanId ? null : prev);
        }, 2000);
        
        setErrorMsg(response.error || 'Access Denied: Ticket is invalid');
      }
    } catch (err) {
      console.error(err);
      playBeep('not_found');
      setErrorMsg('Network error occurred during lookup.');
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
    handleLookupContinuous({ code: manualCode.trim().toUpperCase(), method: 'manual_code' });
    setManualCode('');
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

  // Auto-start scanner on mount
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
      {/* High-contrast Full-Screen Scan Result Overlay */}
      {lastScan && (
        <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 text-center animate-fadeIn backdrop-blur-md border-y ${
          lastScan.outcome === 'verified'
            ? 'bg-emerald-950/98 border-emerald-500 text-emerald-400'
            : lastScan.outcome === 'already_checked_in'
            ? 'bg-amber-950/98 border-amber-500 text-amber-400'
            : 'bg-rose-950/98 border-rose-500 text-rose-400'
        }`}>
          <div className={`p-5 rounded-full mb-4 ${
            lastScan.outcome === 'verified'
              ? 'bg-emerald-500/10'
              : lastScan.outcome === 'already_checked_in'
              ? 'bg-amber-500/10'
              : 'bg-rose-500/10'
          }`}>
            {lastScan.outcome === 'verified' && <UserCheck size={64} />}
            {lastScan.outcome === 'already_checked_in' && <AlertCircle size={64} />}
            {lastScan.outcome === 'not_found' && <UserX size={64} />}
          </div>

          <h3 className="text-3xl sm:text-4xl font-black tracking-wider uppercase mb-3">
            {lastScan.outcome === 'verified' && 'VERIFIED ACCESS'}
            {lastScan.outcome === 'already_checked_in' && 'ALREADY IN'}
            {lastScan.outcome === 'not_found' && 'NOT REGISTERED'}
          </h3>

          <div className="space-y-2 text-white max-w-sm">
            <p className="text-xl sm:text-2xl font-bold">
              {lastScan.name || lastScan.user_email || 'Invalid Pass'}
            </p>
            {lastScan.role && (
              <p className="text-sm sm:text-base text-slate-300 font-medium capitalize">
                Role: {lastScan.role === 'other' ? lastScan.role_other_detail : lastScan.role}
              </p>
            )}
            {lastScan.checked_in_at && (
              <p className="text-xs text-slate-400">
                Scanned at: {new Date(lastScan.checked_in_at).toLocaleTimeString()}
              </p>
            )}
          </div>

          <button
            onClick={() => setLastScan(null)}
            className="mt-8 px-8 py-3 text-sm font-bold bg-white/10 hover:bg-white/20 active:scale-[0.98] text-white rounded-2xl transition-all"
          >
            Scan Next Pass
          </button>
        </div>
      )}

      {/* Network Blip State */}
      {!isOnline && (
        <div className="p-3 bg-amber-500/20 border border-amber-500/40 rounded-2xl flex items-center justify-center gap-2 text-amber-400 text-xs font-semibold animate-pulse">
          <RefreshCw size={14} className="animate-spin" />
          <span>Connection Lost. Scanner will sync once reconnected.</span>
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
            lastScan?.outcome === 'verified'
              ? 'border-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.3)] ring-2 ring-emerald-500/20'
              : lastScan?.outcome === 'already_checked_in'
              ? 'border-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.3)] ring-2 ring-amber-500/20'
              : lastScan?.outcome === 'not_found'
              ? 'border-rose-500 shadow-[0_0_25px_rgba(244,63,94,0.3)] ring-2 ring-rose-500/20'
              : 'border-slate-800'
          }`}>

            <div id={qrRegionId} className="w-full h-full object-cover"></div>
            
            {/* Viewfinder with corners & laser line */}
            {scannerActive && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="absolute inset-0 bg-slate-950/40"></div>
                <div className="w-56 h-56 border-2 border-slate-700/50 rounded-2xl relative bg-transparent shadow-[0_0_0_9999px_rgba(15,23,42,0.45)]">
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl -mt-1 -ml-1"></div>
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl -mt-1 -mr-1"></div>
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl -mb-1 -ml-1"></div>
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-xl -mb-1 -mr-1"></div>
                  
                  <div className="absolute left-0 right-0 h-1 bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)] animate-laser"></div>
                </div>
              </div>
            )}

            {/* Live Scan Notification Viewfinder Toast removed in favor of full screen overlay */}

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

      {/* Scan History Ledger Ledger Panel */}
      <div className="glass-panel p-6 rounded-3xl space-y-4 max-w-full overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="text-emerald-400" size={20} />
            <h2 className="font-bold text-base text-slate-100">Scan Activity Ledger</h2>
          </div>
          <button 
            onClick={() => fetchLogs()} 
            className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-xl transition-all"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-900">
          <table className="w-full text-left text-xs border-collapse whitespace-nowrap">
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
    </div>
  );
}
