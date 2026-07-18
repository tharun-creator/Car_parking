import { jsPDF } from 'jspdf';

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
  });
};

export async function generateTicketPdfDoc(registration: {
  name: string;
  role: string;
  role_other_detail?: string;
  user_email: string;
  phone_number?: string;
  backup_code: string;
}, qrDataUrl: string): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [100, 160] // Adjusted to 160mm height to accommodate the logo at the bottom
  });

  // Background Slate-950 card
  doc.setFillColor(2, 6, 23);
  doc.rect(0, 0, 100, 160, 'F');

  // Emerald Border Frame
  doc.setDrawColor(16, 185, 129);
  doc.setLineWidth(0.8);
  doc.rect(4, 4, 92, 152);

  // Header Title
  doc.setTextColor(16, 185, 129);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('GATEKEEPER PASS', 50, 18, { align: 'center' });

  // Header Subtitle
  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('EVENT PARKING REGISTRATION', 50, 23, { align: 'center' });

  // Divider Line
  doc.setDrawColor(51, 65, 85);
  doc.setLineWidth(0.4);
  doc.line(10, 27, 90, 27);

  // User Name
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(registration.name.toUpperCase(), 50, 36, { align: 'center' });

  // Role details
  const displayRole = registration.role === 'other' ? (registration.role_other_detail || 'Other') : registration.role;
  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`ROLE: ${displayRole.toUpperCase()}`, 50, 42, { align: 'center' });

  // Email & Phone
  doc.setFontSize(8);
  doc.text(`EMAIL: ${registration.user_email || 'N/A'}`, 50, 47, { align: 'center' });
  if (registration.phone_number) {
    doc.text(`PHONE: ${registration.phone_number}`, 50, 52, { align: 'center' });
  }

  // QR Code Image (placed in the center below details)
  doc.addImage(qrDataUrl, 'PNG', 22, 57, 56, 56);

  // Backup Code Container
  doc.setFillColor(15, 23, 42);
  doc.rect(20, 116, 60, 15, 'F');
  doc.setDrawColor(51, 65, 85);
  doc.rect(20, 116, 60, 15, 'D');

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.text('BACKUP ENTRY CODE', 50, 120, { align: 'center' });

  doc.setTextColor(255, 255, 255);
  doc.setFont('courier', 'bold');
  doc.setFontSize(12);
  doc.text(registration.backup_code, 50, 128, { align: 'center' });

  // Add SPI Edge Logo at the bottom
  try {
    const logoImg = await loadImage('/spi-edge-logo.png');
    doc.addImage(logoImg, 'PNG', 43, 134, 14, 14);
  } catch (err) {
    console.error('Failed to load logo image for PDF:', err);
  }

  // Footer Instructions
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Please present this ticket at the entry gate.', 50, 153, { align: 'center' });

  return doc;
}

export async function downloadTicketPdf(registration: {
  name: string;
  role: string;
  role_other_detail?: string;
  user_email: string;
  phone_number?: string;
  backup_code: string;
}, qrDataUrl: string) {
  const doc = await generateTicketPdfDoc(registration, qrDataUrl);
  doc.save(`${registration.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-parking-pass.pdf`);
}
