import AuthShell from "@/features/auth/AuthShell";
import LoginForm from "@/features/auth/login/LoginForm";
export default async function LoginPage({ searchParams }: { searchParams?: Promise<{ verified?: string }> } = {}) {
  const query = await searchParams;
  return <AuthShell><LoginForm verified={query?.verified === "1"} /></AuthShell>;
}
