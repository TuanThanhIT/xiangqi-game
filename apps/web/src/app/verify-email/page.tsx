import AuthShell from "@/features/auth/AuthShell";
import VerifyEmailForm from "@/features/auth/otp/VerifyEmailForm";
import Link from "next/link";
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const query = await searchParams;
  return <AuthShell screen="otp">{query.account && /^[0-9a-f-]{36}$/i.test(query.account) ? <VerifyEmailForm accountId={query.account} /> : <section><h1>Xác minh email</h1><p>Vui lòng đăng ký hoặc đăng nhập để tiếp tục xác minh.</p><Link href="/login">Về đăng nhập</Link></section>}</AuthShell>;
}
