'use client';

import dynamic from 'next/dynamic';

// Dynamically load the scanner interface client side to prevent ssr camera access errors
const ScannerInterface = dynamic(
  () => import('@/components/ScannerInterface'),
  { ssr: false }
);

export function ScanClient() {
  return <ScannerInterface />;
}
export default ScanClient;
