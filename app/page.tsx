import { Suspense } from "react";
import { redirect } from "next/navigation";
import Counter from "@/app/components/counter";
import { logout } from "@/app/auth-actions";
import { getAccess } from "@/lib/access";

async function ProtectedCounter() {
  const access = await getAccess();
  if (access !== "allowed") redirect("/login");

  return (
    <Counter>
      <form action={logout}>
        <button>ログアウト</button>
      </form>
    </Counter>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<p>確認中...</p>}>
      <ProtectedCounter />
    </Suspense>
  );
}
