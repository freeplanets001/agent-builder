import { redirect } from "next/navigation";

/**
 * ルートページ — ダッシュボードへリダイレクト
 * middleware.ts が未認証ユーザーを /login に転送するため
 * ここには認証済みユーザーのみ到達する
 */
export default function RootPage() {
  redirect("/agents");
}
