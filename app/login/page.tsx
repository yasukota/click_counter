import { Suspense } from "react";
import { redirect } from "next/navigation";
import { login, logout } from "@/app/auth-actions";
import { getAccess } from "@/lib/access";
import { hasAllowedEmails, isAuthConfigured } from "@/lib/auth-policy";

type Props = { searchParams: Promise<{ error?: string }> };

async function LoginContent({ searchParams }: Props) {
  const access = await getAccess();
  if (access === "allowed") redirect("/");
  const { error } = await searchParams;
  const configured = isAuthConfigured() && hasAllowedEmails();

  return (
    <>
      <h1>クリックカウンター</h1>
      <p>許可されたGoogleアカウントでログインしてください。</p>
      {!configured && <p role="alert">ログインの設定が完了していません。管理者に確認してください。</p>}
      {configured && (error || access === "forbidden") && (
        <p role="alert">ログインできませんでした。許可されたアカウントか、設定を確認してください。</p>
      )}
      <form action={login}>
        <button disabled={!configured}>Googleでログイン</button>
      </form>
      {access === "forbidden" && (
        <form action={logout}><button>ログアウト</button></form>
      )}
    </>
  );
}

export default function LoginPage(props: Props) {
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "24px", backgroundColor: "#EAF3FF" }}>
      <Suspense fallback={<p>確認中...</p>}>
        <LoginContent {...props} />
      </Suspense>
    </main>
  );
}
