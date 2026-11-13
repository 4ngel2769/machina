/**
 * Root layout: document shell, fonts and global styles.
 */
import './globals.css';
import 'sonner/dist/styles.css';

export const metadata = {
  title: 'machina',
  description: 'rent small VMs',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
