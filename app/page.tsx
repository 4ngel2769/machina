import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

export default async function Home() {
  const user = await requireUser();
  redirect(user ? '/home' : '/signin');
}
