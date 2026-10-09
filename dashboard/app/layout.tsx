import type {Metadata} from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Muthoot Finance Secure Access Control Center',
  description: 'Tenant-aware administration for Muthoot Finance split-trust lockers.',
};

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
