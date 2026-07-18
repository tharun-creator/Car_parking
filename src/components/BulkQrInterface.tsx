'use client';

import { useState, useEffect } from 'react';
import { generateBulkRegistrationsAction } from '@/app/actions';
import { Layers, Download, CheckCircle, RefreshCw, AlertCircle, FileSpreadsheet, PlusCircle, ArrowLeft } from 'lucide-react';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import Link from 'next/link';

export default function BulkQrInterface() {
  const [mounted, setMounted] = useState(false);
  const [role, setRole] = useState<'crew' | 'volunteer' | 'artist' | 'vip' | 'government' | 'media' | 'other'>('vip');
  const [roleOtherDetail, setRoleOtherDetail] = useState('');
  const [count, setCount] = useState<number>(10);
  const [prefix, setPrefix] = useState('VIP Pass');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Results display
  const [generatedPasses, setGeneratedPasses] = useState<any[]>([]);
  const [zipDataUrl, setZipDataUrl] = useState<string | null>(null);
  const [zipName, setZipName] = useState<string>('');

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="glass-panel p-6 rounded-3xl min-h-[400px] flex items-center justify-center">
        <RefreshCw size={24} className="animate-spin text-blue-500" />
      </div>
    );
  }

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (count < 1 || count > 250) {
      setErrorMsg('Please specify a quantity between 1 and 250.');
      return;
    }
    if (role === 'other' && !roleOtherDetail.trim()) {
      setErrorMsg('Please provide description for "Other" role.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setZipDataUrl(null);
    setGeneratedPasses([]);

    try {
      const response = await generateBulkRegistrationsAction({
        role,
        roleOtherDetail: role === 'other' ? roleOtherDetail : undefined,
        count,
        prefix: prefix.trim() || undefined,
      });

      if (!response.success || !response.registrations) {
        setErrorMsg(response.error || 'Failed to generate bulk QR codes.');
        setLoading(false);
        return;
      }

      const regs = response.registrations;
      setGeneratedPasses(regs);

      // Create ZIP archive
      const zip = new JSZip();
      const qrFolder = zip.folder('qr-codes');
      
      // Manifest CSV structure
      let csvContent = 'Name,Role,Email,Backup Code,QR Token,Status\n';

      // Generate QR codes for each registration and pack into ZIP
      for (let i = 0; i < regs.length; i++) {
        const reg = regs[i];
        
        // Generate QR code data URL (high quality pure black on white for perfect scanner read)
        const qrDataUrl = await QRCode.toDataURL(reg.qr_token, {
          margin: 4,
          width: 600,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });

        // Convert data URL to base64 binary representation
        const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, '');
        
        // Safe filename for each QR Code image
        const safeName = `${reg.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${reg.backup_code}`;
        qrFolder?.file(`${safeName}.png`, base64Data, { base64: true });

        // Add row to manifest
        const displayRole = reg.role === 'other' ? reg.role_other_detail : reg.role;
        csvContent += `"${reg.name}","${displayRole}","${reg.user_email}","${reg.backup_code}","${reg.qr_token}","${reg.status}"\n`;
      }

      // Add Manifest CSV to zip root
      zip.file('manifest.csv', csvContent);

      // Generate ZIP content
      const content = await zip.generateAsync({ type: 'blob' });
      const dataUrl = URL.createObjectURL(content);
      
      const safeZipName = `bulk-passes-${role}-${new Date().toISOString().slice(0, 10)}.zip`;
      setZipDataUrl(dataUrl);
      setZipName(safeZipName);
    } catch (err) {
      console.error(err);
      setErrorMsg('An unexpected error occurred during zip construction.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Alert display */}
      {errorMsg && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center justify-between gap-3 text-rose-400 text-sm">
          <div className="flex gap-2.5 items-center">
            <AlertCircle className="shrink-0" size={18} />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-slate-400 hover:text-white font-bold">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Generator Form */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-3xl space-y-6">
          <div className="flex items-center gap-2">
            <Layers className="text-blue-400 animate-pulse" size={20} />
            <span className="font-semibold text-sm">QR Code Generator Config</span>
          </div>

          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="role" className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Target Role
              </label>
              <select
                id="role"
                value={role}
                onChange={(e: any) => {
                  setRole(e.target.value);
                  setPrefix(`${e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1)} Pass`);
                }}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:border-blue-500 text-slate-100 outline-none text-sm transition-all duration-200"
              >
                <option value="vip">VIP</option>
                <option value="crew">Crew</option>
                <option value="volunteer">Volunteer</option>
                <option value="artist">Artist</option>
                <option value="government">Government</option>
                <option value="media">Media</option>
                <option value="other">Other / Custom</option>
              </select>
            </div>

            {role === 'other' && (
              <div className="space-y-1 animate-fadeIn">
                <label htmlFor="roleOtherDetail" className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Specify Custom Role Name
                </label>
                <input
                  type="text"
                  id="roleOtherDetail"
                  value={roleOtherDetail}
                  onChange={(e) => setRoleOtherDetail(e.target.value)}
                  placeholder="e.g. Exhibitor, Sponsor"
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl text-white outline-none text-sm transition-all"
                />
              </div>
            )}

            <div className="space-y-1">
              <label htmlFor="prefix" className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Pass Ticket Name Prefix
              </label>
              <input
                type="text"
                id="prefix"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                placeholder="e.g. VIP Pass"
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl text-white outline-none text-sm transition-all"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="count" className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Quantity to Generate
              </label>
              <input
                type="number"
                id="count"
                min="1"
                max="250"
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value) || 0)}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl text-white outline-none text-sm transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold rounded-2xl active:scale-[0.98] transition-all duration-200 text-sm flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Generating Database Records...
                </>
              ) : (
                <>
                  <PlusCircle size={16} />
                  Generate Bulk QR Codes
                </>
              )}
            </button>
          </form>
        </div>

        {/* Results / Download Panel */}
        <div className="lg:col-span-3 glass-panel p-6 rounded-3xl flex flex-col justify-between min-h-[400px]">
          {zipDataUrl ? (
            <div className="space-y-6 flex flex-col h-full justify-between">
              {/* Header result */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle size={24} />
                  <span className="font-semibold text-lg font-display">Generation Complete!</span>
                </div>
                <p className="text-slate-400 text-xs">
                  Successfully created <span className="text-white font-bold">{generatedPasses.length}</span> registration passes for the role <span className="text-white font-bold capitalize">{role === 'other' ? roleOtherDetail : role}</span>.
                </p>

                {/* Download Actions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <a
                    href={zipDataUrl}
                    download={zipName}
                    className="flex items-center justify-center gap-2 px-5 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl transition-all shadow-lg shadow-emerald-950/20 active:scale-[0.98] text-sm"
                  >
                    <Download size={18} />
                    Download ZIP ({generatedPasses.length} QRs)
                  </a>
                  <button
                    onClick={() => {
                      const csvFile = generatedPasses.reduce((acc, reg) => {
                        const displayRole = reg.role === 'other' ? reg.role_other_detail : reg.role;
                        return acc + `"${reg.name}","${displayRole}","${reg.user_email}","${reg.backup_code}","${reg.qr_token}"\n`;
                      }, 'Name,Role,Email,Backup Code,QR Token\n');
                      const blob = new Blob([csvFile], { type: 'text/csv' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `manifest-${role}.csv`;
                      a.click();
                    }}
                    className="flex items-center justify-center gap-2 px-5 py-4 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 hover:text-white font-bold rounded-2xl transition-all active:scale-[0.98] text-sm"
                  >
                    <FileSpreadsheet size={18} />
                    Export CSV Manifest
                  </button>
                </div>
              </div>

              {/* Passes preview table */}
              <div className="flex-1 min-h-[180px] max-h-[220px] overflow-y-auto border border-slate-900 rounded-xl bg-slate-950/50 p-2 scrollbar-thin">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-900">
                      <th className="py-2 px-2">Ticket Name</th>
                      <th className="py-2 px-2">Backup Code</th>
                      <th className="py-2 px-2">Mock Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generatedPasses.map((reg) => (
                      <tr key={reg.row_id} className="border-b border-slate-900/60 hover:bg-slate-900/20">
                        <td className="py-2 px-2 text-slate-100 font-semibold">{reg.name}</td>
                        <td className="py-2 px-2 font-mono text-blue-400 font-bold tracking-wider">{reg.backup_code}</td>
                        <td className="py-2 px-2 text-slate-400 font-mono truncate max-w-[120px]">{reg.user_email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center my-auto text-center space-y-3 p-6">
              <div className="p-4 bg-slate-900 border border-slate-800 text-slate-500 rounded-3xl">
                <Layers size={36} />
              </div>
              <div className="space-y-1">
                <span className="font-semibold text-slate-200 text-sm block">Awaiting Configuration</span>
                <span className="text-[11px] text-slate-500 max-w-xs block">
                  Select a role and input the quantity of QR codes you want to generate. They will be immediately packed into a downloadable ZIP archive.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
