"use client";

import { useEffect, useState, useCallback } from "react";
import { Store, Search, Download, Star, Filter } from "lucide-react";
import Button from "@/components/ui/Button";

const CATEGORIES = [
  { id: "", label: "すべて" },
  { id: "general", label: "汎用" },
  { id: "writing", label: "ライティング" },
  { id: "coding", label: "コーディング" },
  { id: "analysis", label: "分析" },
  { id: "creative", label: "クリエイティブ" },
  { id: "business", label: "ビジネス" },
  { id: "education", label: "教育" },
  { id: "research", label: "リサーチ" },
  { id: "image", label: "画像" },
  { id: "automation", label: "自動化" },
] as const;

interface Listing {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  install_count: number;
  rating_sum: number;
  rating_count: number;
  avg_rating: string | null;
  snapshot_model: string;
  published_at: string;
}

export default function MarketplacePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("popular");
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [installing, setInstalling] = useState<string | null>(null);

  const fetchListings = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (category) params.set("category", category);
      params.set("sort", sort);

      const res = await fetch(`/api/marketplace?${params}`);
      if (!res.ok) throw new Error("取得に失敗しました");
      const data = await res.json() as { listings: Listing[]; total: number };
      setListings(data.listings);
      setTotal(data.total);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [search, category, sort]);

  useEffect(() => {
    const timer = setTimeout(fetchListings, 300);
    return () => clearTimeout(timer);
  }, [fetchListings]);

  async function handleInstall(listingId: string, title: string) {
    if (!confirm(`「${title}」をインストールしますか？ワークスペースにエージェントが複製されます。`)) return;
    setInstalling(listingId);
    try {
      const res = await fetch(`/api/marketplace/${listingId}/install`, { method: "POST" });
      const data = await res.json() as { message?: string; error?: string };
      if (!res.ok) {
        alert(data.error ?? "インストールに失敗しました");
        return;
      }
      alert(data.message ?? "インストールしました");
      fetchListings();
    } catch {
      alert("ネットワークエラー");
    } finally {
      setInstalling(null);
    }
  }

  return (
    <div style={{ padding: "36px 40px", maxWidth: "1280px" }}>
      {/* ヘッダー */}
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{
          fontSize: "26px", fontWeight: 750, letterSpacing: "-0.03em",
          color: "var(--color-text)", display: "flex", alignItems: "center", gap: "12px",
        }}>
          <Store size={28} style={{ color: "var(--color-primary)" }} />
          マーケットプレイス
        </h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: "13.5px", marginTop: "4px" }}>
          {isLoading ? "読み込み中..." : `${total}件のエージェントが公開中`}
        </p>
      </div>

      {/* フィルターバー */}
      <div style={{
        display: "flex", gap: "12px", marginBottom: "28px", flexWrap: "wrap", alignItems: "center",
      }}>
        {/* 検索 */}
        <div style={{ position: "relative", flex: "1 1 280px", maxWidth: "420px" }}>
          <Search
            size={15}
            style={{
              position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)",
              color: "var(--color-text-muted)", pointerEvents: "none",
            }}
          />
          <input
            placeholder="エージェントを検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%", padding: "10px 14px 10px 40px", borderRadius: "var(--radius-md)",
              background: "var(--color-surface)", border: "1px solid var(--color-border)",
              color: "var(--color-text)", fontSize: "13.5px", fontFamily: "inherit", outline: "none",
              boxShadow: "var(--shadow-xs)",
            }}
          />
        </div>

        {/* ソート */}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          style={{
            padding: "10px 14px", borderRadius: "var(--radius-md)",
            background: "var(--color-surface)", border: "1px solid var(--color-border)",
            color: "var(--color-text)", fontSize: "13px", fontFamily: "inherit",
            boxShadow: "var(--shadow-xs)", cursor: "pointer",
          }}
        >
          <option value="popular">人気順</option>
          <option value="newest">新着順</option>
          <option value="rating">評価順</option>
        </select>
      </div>

      {/* カテゴリタブ */}
      <div style={{
        display: "flex", gap: "6px", marginBottom: "24px", overflowX: "auto",
        paddingBottom: "4px",
      }}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            style={{
              padding: "6px 16px", borderRadius: "100px", fontSize: "12.5px", fontWeight: 500,
              border: "1px solid",
              borderColor: category === cat.id ? "var(--color-primary)" : "var(--color-border)",
              background: category === cat.id ? "var(--color-primary-light)" : "var(--color-surface)",
              color: category === cat.id ? "var(--color-primary)" : "var(--color-text-secondary)",
              cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
              transition: "all 0.15s ease",
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* ローディング */}
      {isLoading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: "200px" }} />
          ))}
        </div>
      )}

      {/* 空状態 */}
      {!isLoading && listings.length === 0 && (
        <div className="animate-in" style={{ textAlign: "center", padding: "80px 24px" }}>
          <div style={{
            width: "72px", height: "72px", borderRadius: "var(--radius-lg)",
            background: "var(--color-surface-2)", border: "1px solid var(--color-border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px",
          }}>
            <Store size={32} color="var(--color-text-muted)" />
          </div>
          <h2 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px" }}>
            公開エージェントがありません
          </h2>
          <p style={{ fontSize: "13.5px", color: "var(--color-text-muted)" }}>
            エージェント詳細画面から公開できます
          </p>
        </div>
      )}

      {/* リスティンググリッド */}
      {!isLoading && listings.length > 0 && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px",
        }}>
          {listings.map((listing) => (
            <article
              key={listing.id}
              className="card-gradient animate-in"
              style={{ padding: 0, overflow: "hidden" }}
            >
              <div style={{ padding: "20px 20px 14px" }}>
                {/* タイトル + カテゴリ */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "8px" }}>
                  <h3 style={{ fontSize: "15px", fontWeight: 650, letterSpacing: "-0.02em", color: "var(--color-text)" }}>
                    {listing.title}
                  </h3>
                  <span className="badge" style={{
                    color: "var(--color-primary)", background: "var(--color-primary-light)",
                    border: "1px solid rgba(99,102,241,0.12)", flexShrink: 0, fontSize: "11px",
                  }}>
                    {CATEGORIES.find((c) => c.id === listing.category)?.label ?? listing.category}
                  </span>
                </div>

                {/* 説明 */}
                <p style={{
                  fontSize: "13px", lineHeight: 1.6, color: "var(--color-text-muted)",
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  overflow: "hidden", marginBottom: "14px",
                }}>
                  {listing.description}
                </p>

                {/* メトリクス */}
                <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "var(--color-text-muted)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <Download size={13} />
                    {listing.install_count}
                  </span>
                  {listing.avg_rating && (
                    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <Star size={13} fill="#f59e0b" color="#f59e0b" />
                      {listing.avg_rating} ({listing.rating_count})
                    </span>
                  )}
                  <span>{listing.snapshot_model}</span>
                </div>

                {/* タグ */}
                {listing.tags.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "10px" }}>
                    {listing.tags.slice(0, 3).map((tag) => (
                      <span key={tag} style={{
                        padding: "2px 8px", borderRadius: "100px", fontSize: "11px",
                        color: "var(--color-text-secondary)", background: "var(--color-surface-2)",
                        border: "1px solid var(--color-border)",
                      }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* アクション */}
              <div style={{
                padding: "12px 20px", borderTop: "1px solid var(--color-border)",
                background: "var(--color-surface-2)", display: "flex", justifyContent: "flex-end",
              }}>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Download size={14} />}
                  loading={installing === listing.id}
                  onClick={() => handleInstall(listing.id, listing.title)}
                >
                  インストール
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
