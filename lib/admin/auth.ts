import { auth } from '@/auth';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? 'nghiaphan081301@gmail.com')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export async function isAdminRequest(): Promise<boolean> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  return !!email && ADMIN_EMAILS.includes(email);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
