'use client';

import { useState, useEffect } from 'react';
import { generateBulkRegistrationsAction, generateCustomBulkRegistrationsAction } from '@/app/actions';
import { Layers, Download, CheckCircle, RefreshCw, AlertCircle, FileSpreadsheet, PlusCircle, ArrowLeft, Upload, FileText, UserPlus, Eye } from 'lucide-react';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import Link from 'next/link';
import { downloadTicketPdf, generateTicketPdfDoc } from '@/lib/pdf';

interface ParsedEntry {
  name: string;
  email?: string;
  phone?: string;
  details?: string;
}

export default function BulkQrInterface() {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<'generic' | 'import' | 'single'>('generic');
  const [role, setRole] = useState<'crew' | 'volunteer' | 'artist' | 'vip' | 'government' | 'media' | 'other'>('vip');
  const [roleOtherDetail, setRoleOtherDetail] = useState('');
  const [count, setCount] = useState<number>(10);
  const [prefix, setPrefix] = useState('VIP Pass');
  
  // Custom Import States
  const [inputText, setInputText] = useState('');
  const [parsedEntries, setParsedEntries] = useState<ParsedEntry[]>([]);

  // Single Pass Manual Entry States
  const [singleName, setSingleName] = useState('');
  const [singleEmail, setSingleEmail] = useState('');
  const [singlePhone, setSinglePhone] = useState('');
  const [singleDetails, setSingleDetails] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Results display
  const [generatedPasses, setGeneratedPasses] = useState<any[]>([]);
  const [zipDataUrl, setZipDataUrl] = useState<string | null>(null);
  const [zipName, setZipName] = useState<string>('');

  useEffect(() => {
    setMounted(true);
  }, []);

  // Parse pasted/imported text on modification
  useEffect(() => {
    if (mode === 'import') {
      if (!inputText.trim()) {
        setParsedEntries([]);
        return;
      }
      
      const lines = inputText.split(/\r?\n/);
      const entries: ParsedEntry[] = [];
      
      for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        
        let parts: string[] = [];
        if (line.includes('\t')) {
          parts = line.split('\t');
        } else if (line.includes(';')) {
          parts = line.split(';');
        } else {
          parts = line.split(',');
        }
        
        parts = parts.map(p => p.trim().replace(/^["']|["']$/g, ''));
        const name = parts[0];
        if (!name) continue;
        
        let email: string | undefined;
        let phone: string | undefined;
        let details: string | undefined;
        
        const remaining = parts.slice(1);
        for (const part of remaining) {
          if (!part) continue;
          if (part.includes('@') && !email) {
            email = part;
          } else if (/^\+?[0-9\s-()]{6,20}$/.test(part) && !phone) {
            phone = part;
          } else {
            if (!details) {
              details = part;
            } else {
              details += ` | ${part}`;
            }
          }
        }
        
        entries.push({ name, email, phone, details });
      }
      setParsedEntries(entries);
    } else {
      setParsedEntries([]);
    }
  }, [inputText, mode]);

  if (!mounted) {
    return (
      <div className="glass-panel p-6 rounded-3xl min-h-[400px] flex items-center justify-center">
        <RefreshCw size={24} className="animate-spin text-blue-500" />
      </div>
    );
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setInputText(text);
      }
    };
    reader.readAsText(file);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (mode === 'generic') {
      if (count < 1 || count > 250) {
        setErrorMsg('Please specify a quantity between 1 and 250.');
        return;
      }
    } else if (mode === 'import') {
      if (parsedEntries.length === 0) {
        setErrorMsg('Please paste some names/details or upload a document to proceed.');
        return;
      }
      if (parsedEntries.length > 250) {
        setErrorMsg('Maximum 250 entries allowed at a time.');
        return;
      }
    } else {
      if (!singleName.trim()) {
        setErrorMsg('Attendee Name is required.');
        return;
      }
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
      let response;
      if (mode === 'generic') {
        response = await generateBulkRegistrationsAction({
          role,
          roleOtherDetail: role === 'other' ? roleOtherDetail : undefined,
          count,
          prefix: prefix.trim() || undefined,
        });
      } else if (mode === 'import') {
        response = await generateCustomBulkRegistrationsAction({
          role,
          roleOtherDetail: role === 'other' ? roleOtherDetail : undefined,
          entries: parsedEntries,
        });
      } else {
        response = await generateCustomBulkRegistrationsAction({
          role,
          roleOtherDetail: role === 'other' ? roleOtherDetail : undefined,
          entries: [{
            name: singleName.trim(),
            email: singleEmail.trim() || undefined,
            phone: singlePhone.trim() || undefined,
            details: singleDetails.trim() || undefined
          }],
        });
      }

      if (!response.success || !response.registrations) {
        setErrorMsg(response.error || 'Failed to generate QR codes.');
        setLoading(false);
        return;
      }

      const regs = response.registrations;
      setGeneratedPasses(regs);

      // Only build ZIP archive for generic & bulk import
      if (mode !== 'single') {
        const zip = new JSZip();
        const qrFolder = zip.folder('qr-codes');
        const pdfFolder = zip.folder('pdf-tickets');
        let csvContent = 'Name,Role,Email,Backup Code,QR Token,Status\n';

        for (let i = 0; i < regs.length; i++) {
          const reg = regs[i];
          const qrDataUrl = await QRCode.toDataURL(reg.qr_token, {
            margin: 4,
            width: 600,
            color: {
              dark: '#000000',
              light: '#ffffff',
            },
          });

          const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, '');
          const safeName = `${reg.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${reg.backup_code}`;
          qrFolder?.file(`${safeName}.png`, base64Data, { base64: true });

          // Generate PDF Ticket pass with SPI Edge Logo and add it to the pdf-tickets folder
          try {
            const pdfDoc = await generateTicketPdfDoc({
              name: reg.name,
              role: reg.role,
              role_other_detail: reg.role_other_detail,
              user_email: reg.user_email || '',
              phone_number: reg.phone_number,
              backup_code: reg.backup_code
            }, qrDataUrl);
            const pdfBlob = pdfDoc.output('blob');
            pdfFolder?.file(`${safeName}.pdf`, pdfBlob);
          } catch (pdfErr) {
            console.error(`Failed to generate PDF for ${reg.name} inside ZIP:`, pdfErr);
          }

          const displayRole = reg.role === 'other' ? reg.role_other_detail : reg.role;
          csvContent += `"${reg.name}","${displayRole}","${reg.user_email}","${reg.backup_code}","${reg.qr_token}","${reg.status}"\n`;
        }

        zip.file('manifest.csv', csvContent);

        const content = await zip.generateAsync({ 
          type: 'blob',
          mimeType: 'application/zip'
        });
        const dataUrl = URL.createObjectURL(content);
        const safeZipName = `bulk-passes-${role}-${new Date().toISOString().slice(0, 10)}.zip`;
        setZipDataUrl(dataUrl);
        setZipName(safeZipName);
      } else {
        // Clear fields on successful single creation
        setSingleName('');
        setSingleEmail('');
        setSinglePhone('');
        setSingleDetails('');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Alert display */}
      {errorMsg && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center justify-between gap-3 text-rose-400 text-sm animate-fadeIn">
          <div className="flex gap-2.5 items-center">
            <AlertCircle className="shrink-0" size={18} />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-slate-400 hover:text-white font-bold">✕</button>
        </div>
      )}

      {/* Mode Selector Tabs */}
      <div className="flex bg-slate-900/50 border border-slate-900 p-1.5 rounded-2xl max-w-lg mx-auto">
        <button
          type="button"
          onClick={() => {
            setMode('generic');
            setErrorMsg(null);
            setGeneratedPasses([]);
          }}
          className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all duration-200 ${
            mode === 'generic'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Generic Quantity
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('import');
            setErrorMsg(null);
            setGeneratedPasses([]);
          }}
          className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all duration-200 ${
            mode === 'import'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Import Document
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('single');
            setErrorMsg(null);
            setGeneratedPasses([]);
          }}
          className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all duration-200 ${
            mode === 'single'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Single Pass (Manual)
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Generator Form */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-3xl space-y-6">
          <div className="flex items-center gap-2">
            <Layers className="text-blue-400 animate-pulse" size={20} />
            <span className="font-semibold text-sm">
              {mode === 'generic' && 'Generic QR Config'}
              {mode === 'import' && 'Custom Document Config'}
              {mode === 'single' && 'Single Pass Creator'}
            </span>
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

            {mode === 'generic' && (
              <>
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
              </>
            )}

            {mode === 'import' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label htmlFor="pastedList" className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Paste List (One per line)
                    </label>
                    <label className="text-[10px] text-blue-400 font-semibold cursor-pointer hover:underline flex items-center gap-1">
                      <Upload size={10} />
                      Upload File
                      <input
                        type="file"
                        accept=".txt,.csv,.tsv"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                  
                  <textarea
                    id="pastedList"
                    rows={8}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Formats:&#13;Name&#13;Name, Email&#13;Name, Phone&#13;Name, Email, Phone, Details"
                    className="w-full p-4 bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl text-white outline-none text-xs font-mono leading-relaxed transition-all resize-none"
                  />
                  <span className="block text-[9px] text-slate-500">
                    Supports separation by commas, semicolons, or tabs.
                  </span>
                </div>
              </div>
            )}

            {mode === 'single' && (
              <div className="space-y-3 animate-fadeIn">
                <div className="space-y-1">
                  <label htmlFor="singleName" className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Attendee Name
                  </label>
                  <input
                    type="text"
                    id="singleName"
                    value={singleName}
                    onChange={(e) => setSingleName(e.target.value)}
                    placeholder="e.g. Jane Doe"
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl text-white outline-none text-sm transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="singleEmail" className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Email Address (Optional)
                  </label>
                  <input
                    type="email"
                    id="singleEmail"
                    value={singleEmail}
                    onChange={(e) => setSingleEmail(e.target.value)}
                    placeholder="e.g. jane@example.com"
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl text-white outline-none text-sm transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="singlePhone" className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Phone Number (Optional)
                  </label>
                  <input
                    type="text"
                    id="singlePhone"
                    value={singlePhone}
                    onChange={(e) => setSinglePhone(e.target.value)}
                    placeholder="e.g. +919876543210"
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl text-white outline-none text-sm transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="singleDetails" className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Seat / Access Details (Optional)
                  </label>
                  <input
                    type="text"
                    id="singleDetails"
                    value={singleDetails}
                    onChange={(e) => setSingleDetails(e.target.value)}
                    placeholder="e.g. VIP Box Seat A12"
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl text-white outline-none text-sm transition-all"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (mode === 'import' && parsedEntries.length === 0)}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-900 disabled:text-slate-600 disabled:cursor-not-allowed text-white font-bold rounded-2xl active:scale-[0.98] transition-all duration-200 text-sm flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Creating Pass Record...
                </>
              ) : (
                <>
                  <PlusCircle size={16} />
                  {mode === 'generic' && 'Generate Bulk QRs'}
                  {mode === 'import' && `Generate QRs for ${parsedEntries.length} People`}
                  {mode === 'single' && 'Create QR & Pass Details'}
                </>
              )}
            </button>
          </form>
        </div>

        {/* Results / Download / Preview Panel */}
        <div className="lg:col-span-3 glass-panel p-6 rounded-3xl flex flex-col justify-between min-h-[400px]">
          {generatedPasses.length > 0 ? (
            <div className="space-y-6 flex flex-col h-full justify-between animate-fadeIn">
              {/* Header result */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle size={24} />
                  <span className="font-semibold text-lg font-display">Pass Created!</span>
                </div>
                
                {mode === 'single' ? (
                  <p className="text-slate-400 text-xs">
                    Pass created for <span className="text-white font-bold">{generatedPasses[0].name}</span> as <span className="text-white font-bold capitalize">{role === 'other' ? roleOtherDetail : role}</span>. Download the PDF ticket below.
                  </p>
                ) : (
                  <p className="text-slate-400 text-xs">
                    Successfully created <span className="text-white font-bold">{generatedPasses.length}</span> registration passes for the role <span className="text-white font-bold capitalize">{role === 'other' ? roleOtherDetail : role}</span>.
                  </p>
                )}

                {/* Actions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {mode === 'single' ? (
                    <>
                      <button
                        onClick={async () => {
                          const reg = generatedPasses[0];
                          const qrDataUrl = await QRCode.toDataURL(reg.qr_token, {
                            margin: 4,
                            width: 600,
                            color: {
                              dark: '#000000',
                              light: '#ffffff',
                            },
                          });
                          downloadTicketPdf(reg, qrDataUrl);
                        }}
                        className="flex items-center justify-center gap-2 px-5 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl transition-all shadow-lg shadow-emerald-950/20 active:scale-[0.98] text-sm"
                      >
                        <Download size={18} />
                        Download Ticket PDF
                      </button>
                      <button
                        onClick={() => setGeneratedPasses([])}
                        className="flex items-center justify-center gap-2 px-5 py-4 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 hover:text-white font-bold rounded-2xl transition-all active:scale-[0.98] text-sm"
                      >
                        Create Another Pass
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          if (!zipDataUrl) return;
                          const a = document.createElement('a');
                          a.href = zipDataUrl;
                          a.download = zipName;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                        }}
                        className="flex items-center justify-center gap-2 px-5 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl transition-all shadow-lg shadow-emerald-950/20 active:scale-[0.98] text-sm"
                      >
                        <Download size={18} />
                        Download ZIP ({generatedPasses.length} QRs)
                      </button>
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
                    </>
                  )}
                </div>
              </div>

              {/* Passes preview table */}
              <div className="flex-1 min-h-[180px] max-h-[220px] overflow-y-auto border border-slate-900 rounded-xl bg-slate-950/50 p-2 scrollbar-thin">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-900">
                      <th className="py-2 px-2">Ticket Name</th>
                      <th className="py-2 px-2">Backup Code</th>
                      <th className="py-2 px-2">Email Address</th>
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
          ) : mode === 'import' && parsedEntries.length > 0 ? (
            <div className="space-y-4 flex flex-col h-full justify-between animate-fadeIn">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-blue-400">
                  <FileText size={20} />
                  <span className="font-semibold text-sm">Parsed Document Preview</span>
                </div>
                <p className="text-slate-400 text-xs">
                  We found <span className="text-blue-400 font-bold">{parsedEntries.length}</span> records. Please verify the structure below before generation.
                </p>
              </div>

              {/* Parsed entries visualizer */}
              <div className="flex-1 min-h-[220px] max-h-[260px] overflow-y-auto border border-slate-900 rounded-xl bg-slate-950/50 p-2 scrollbar-thin">
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-900">
                      <th className="py-2 px-2">#</th>
                      <th className="py-2 px-2">Name</th>
                      <th className="py-2 px-2">Email</th>
                      <th className="py-2 px-2">Phone</th>
                      <th className="py-2 px-2">Extra Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedEntries.map((entry, index) => (
                      <tr key={index} className="border-b border-slate-900/60 hover:bg-slate-900/20">
                        <td className="py-2 px-2 text-slate-500">{index + 1}</td>
                        <td className="py-2 px-2 text-slate-200 font-semibold">{entry.name}</td>
                        <td className="py-2 px-2 text-slate-400 font-mono">{entry.email || '—'}</td>
                        <td className="py-2 px-2 text-slate-400 font-mono">{entry.phone || '—'}</td>
                        <td className="py-2 px-2 text-slate-500 italic truncate max-w-[150px]" title={entry.details}>
                          {entry.details || '—'}
                        </td>
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
                  {mode === 'generic' && 'Select a role and input the quantity of QR codes you want to generate. They will be immediately packed into a downloadable ZIP archive.'}
                  {mode === 'import' && 'Paste a list of names/details or upload a CSV/text document. We will parse and display a preview of the records before generation.'}
                  {mode === 'single' && 'Fill out the details on the left to manually create a single QR parking pass, which can be immediately downloaded as a clean PDF.'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
