'use client';

import { useState } from 'react';
import { downloadTicketPdf } from '@/lib/pdf';
import { Download, FileText, Check } from 'lucide-react';

interface PdfDownloadButtonProps {
  registration: {
    name: string;
    role: string;
    role_other_detail?: string;
    user_email: string;
    phone_number?: string;
    backup_code: string;
  };
  qrDataUrl: string;
}

export default function PdfDownloadButton({ registration, qrDataUrl }: PdfDownloadButtonProps) {
  const [downloaded, setDownloaded] = useState(false);

  const handleDownload = async () => {
    try {
      await downloadTicketPdf(registration, qrDataUrl);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2000);
    } catch (err) {
      console.error('Error generating PDF:', err);
    }
  };

  return (
    <button
      onClick={handleDownload}
      className={`w-full flex items-center justify-center gap-2 px-5 py-3.5 font-semibold rounded-2xl active:scale-[0.98] transition-all duration-200 border text-sm ${
        downloaded
          ? 'bg-emerald-600 border-emerald-500 text-white'
          : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-200 hover:text-white'
      }`}
    >
      {downloaded ? (
        <>
          <Check size={16} />
          PDF Ticket Downloaded!
        </>
      ) : (
        <>
          <FileText size={16} />
          Download PDF Ticket Pass
        </>
      )}
    </button>
  );
}
