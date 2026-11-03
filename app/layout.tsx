import './globals.css';

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
