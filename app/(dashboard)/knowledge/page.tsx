"use client";

import { useEffect, useState, useCallback } from "react";
import { BookOpen, Plus, Upload, Search, FileText, Trash2, Loader2 } from "lucide-react";
import Button from "@/components/ui/Button";

interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  document_count: number;
  chunk_count: number;
  status: string;
  agent_id: string | null;
  created_at: string;
}

interface Document {
  id: string;
  title: string;
  source_type: string;
  chunk_count: number;
  token_count: number;
  status: string;
  error_message: string | null;
  created_at: string;
}

interface DocumentDetail extends Document {
  original_content: string | null;
  metadata: Record<string, unknown> | null;
}

interface Chunk {
  id: string;
  content: string;
  chunk_index: number;
  token_count: number;
}

interface SearchResult {
  content: string;
  similarity: number;
  document_title: string;
}

export default function KnowledgePage() {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  // ドキュメントプレビュー
  const [previewDoc, setPreviewDoc] = useState<DocumentDetail | null>(null);
  const [previewChunks, setPreviewChunks] = useState<Chunk[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewTab, setPreviewTab] = useState<"content" | "chunks">("content");

  // KB編集
  const [editingKbName, setEditingKbName] = useState("");
  const [editingKbDesc, setEditingKbDesc] = useState("");
  const [isEditingKb, setIsEditingKb] = useState(false);

  // ドキュメント内容編集
  const [isEditingDoc, setIsEditingDoc] = useState(false);
  const [editDocContent, setEditDocContent] = useState("");
  const [editDocTitle, setEditDocTitle] = useState("");
  const [isSavingDoc, setIsSavingDoc] = useState(false);
  const [saveDocResult, setSaveDocResult] = useState<string | null>(null);

  // 作成フォーム
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // アップロードフォーム
  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");
  const [docType, setDocType] = useState<"text" | "markdown" | "csv">("text");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<"text" | "file">("file");

  // 検索
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const fetchKbs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/knowledge");
      if (res.ok) {
        const data = await res.json() as { knowledge_bases: KnowledgeBase[] };
        setKbs(data.knowledge_bases);
      }
    } catch { /* silent */ }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { fetchKbs(); }, [fetchKbs]);

  const fetchDocuments = useCallback(async (kbId: string) => {
    const res = await fetch(`/api/knowledge/${kbId}/documents`);
    if (res.ok) {
      const data = await res.json() as { documents: Document[] };
      setDocuments(data.documents);
    }
  }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setIsCreating(true);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }),
      });
      if (res.ok) {
        setNewName(""); setNewDesc(""); setShowCreate(false);
        fetchKbs();
      } else {
        const err = await res.json() as { error?: string };
        alert(err.error ?? "作成に失敗しました");
      }
    } catch { alert("エラー"); }
    finally { setIsCreating(false); }
  }

  async function handleUpload() {
    if (!selectedKb || !docTitle.trim() || !docContent.trim()) return;
    setIsUploading(true); setUploadResult(null);
    try {
      const res = await fetch(`/api/knowledge/${selectedKb.id}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: docTitle.trim(), content: docContent.trim(), source_type: docType }),
      });
      const data = await res.json() as { message?: string; error?: string };
      if (res.ok) {
        setUploadResult(data.message ?? "アップロード完了");
        setDocTitle(""); setDocContent("");
        fetchDocuments(selectedKb.id);
        fetchKbs();
      } else {
        setUploadResult(`エラー: ${data.error ?? "アップロード失敗"}`);
      }
    } catch { setUploadResult("ネットワークエラー"); }
    finally { setIsUploading(false); }
  }

  async function handleFileUpload(file: File) {
    if (!selectedKb) return;
    setIsUploading(true); setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", docTitle.trim() || file.name);
      const res = await fetch(`/api/knowledge/${selectedKb.id}/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json() as { message?: string; error?: string };
      if (res.ok) {
        setUploadResult(data.message ?? "アップロード完了");
        setDocTitle("");
        fetchDocuments(selectedKb.id);
        fetchKbs();
      } else {
        setUploadResult(`エラー: ${data.error ?? "アップロード失敗"}`);
      }
    } catch { setUploadResult("ネットワークエラー"); }
    finally { setIsUploading(false); }
  }

  async function handlePreviewDoc(doc: Document) {
    if (!selectedKb) return;
    setIsLoadingPreview(true);
    setPreviewDoc(null);
    setPreviewChunks([]);
    try {
      const res = await fetch(`/api/knowledge/${selectedKb.id}/documents/${doc.id}`);
      if (res.ok) {
        const data = await res.json() as { document: DocumentDetail; chunks: Chunk[] };
        setPreviewDoc(data.document);
        setPreviewChunks(data.chunks);
        setPreviewTab("content");
      }
    } catch { /* silent */ }
    finally { setIsLoadingPreview(false); }
  }

  function startEditDoc() {
    if (!previewDoc) return;
    setEditDocTitle(previewDoc.title);
    setEditDocContent(previewDoc.original_content ?? "");
    setIsEditingDoc(true);
    setSaveDocResult(null);
    setPreviewTab("content");
  }

  async function handleSaveDoc() {
    if (!selectedKb || !previewDoc || !editDocContent.trim()) return;
    setIsSavingDoc(true);
    setSaveDocResult(null);
    try {
      const res = await fetch(`/api/knowledge/${selectedKb.id}/documents/${previewDoc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editDocTitle.trim() || previewDoc.title,
          content: editDocContent.trim(),
          source_type: previewDoc.source_type,
        }),
      });
      const data = await res.json() as { message?: string; error?: string };
      if (res.ok) {
        setSaveDocResult(data.message ?? "更新完了");
        setIsEditingDoc(false);
        // プレビューを再読み込み
        handlePreviewDoc({ ...previewDoc, title: editDocTitle.trim() || previewDoc.title } as Document);
        fetchDocuments(selectedKb.id);
        fetchKbs();
      } else {
        setSaveDocResult(`エラー: ${data.error ?? "更新失敗"}`);
      }
    } catch { setSaveDocResult("ネットワークエラー"); }
    finally { setIsSavingDoc(false); }
  }

  function closePreview() {
    setPreviewDoc(null);
    setPreviewChunks([]);
    setIsEditingDoc(false);
    setSaveDocResult(null);
  }

  async function handleDeleteDoc(docId: string, title: string) {
    if (!selectedKb || !confirm(`「${title}」を削除しますか？チャンクとEmbeddingも削除されます。`)) return;
    try {
      const res = await fetch(`/api/knowledge/${selectedKb.id}/documents/${docId}`, { method: "DELETE" });
      if (res.ok) {
        fetchDocuments(selectedKb.id);
        fetchKbs();
        if (previewDoc?.id === docId) closePreview();
      }
    } catch { alert("削除に失敗しました"); }
  }

  async function handleDeleteKb() {
    if (!selectedKb || !confirm(`「${selectedKb.name}」を削除しますか？全ドキュメントとチャンクも削除されます。`)) return;
    try {
      const res = await fetch(`/api/knowledge/${selectedKb.id}`, { method: "DELETE" });
      if (res.ok) {
        setSelectedKb(null);
        setDocuments([]);
        closePreview();
        fetchKbs();
      }
    } catch { alert("削除に失敗しました"); }
  }

  async function handleEditKb() {
    if (!selectedKb || !editingKbName.trim()) return;
    try {
      const res = await fetch(`/api/knowledge/${selectedKb.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingKbName.trim(), description: editingKbDesc.trim() }),
      });
      if (res.ok) {
        setIsEditingKb(false);
        fetchKbs();
        setSelectedKb({ ...selectedKb, name: editingKbName.trim(), description: editingKbDesc.trim() });
      }
    } catch { alert("更新に失敗しました"); }
  }

  async function handleSearch() {
    if (!selectedKb || !searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch("/api/knowledge/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery.trim(), knowledge_base_id: selectedKb.id }),
      });
      if (res.ok) {
        const data = await res.json() as { results: SearchResult[] };
        setSearchResults(data.results);
      }
    } catch { /* silent */ }
    finally { setIsSearching(false); }
  }

  return (
    <div style={{ padding: "36px 40px", maxWidth: "1280px" }}>
      {/* ヘッダー */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
        <div>
          <h1 style={{ fontSize: "26px", fontWeight: 750, letterSpacing: "-0.03em", display: "flex", alignItems: "center", gap: "12px" }}>
            <BookOpen size={28} style={{ color: "var(--color-primary)" }} />
            ナレッジベース
          </h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: "13.5px", marginTop: "4px" }}>
            ドキュメントをアップロードしてエージェントに外部知識を注入 (RAG)
          </p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setShowCreate(true)}>
          新しいナレッジベース
        </Button>
      </div>

      {/* 作成モーダル */}
      {showCreate && (
        <div style={{
          padding: "24px", borderRadius: "var(--radius-lg)", background: "var(--color-surface)",
          border: "1px solid var(--color-border)", boxShadow: "var(--shadow-lg)", marginBottom: "24px",
        }}>
          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px" }}>ナレッジベースを作成</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <input placeholder="名前" value={newName} onChange={(e) => setNewName(e.target.value)}
              style={{ padding: "10px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", fontSize: "14px", fontFamily: "inherit" }} />
            <input placeholder="説明（任意）" value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
              style={{ padding: "10px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", fontSize: "14px", fontFamily: "inherit" }} />
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => setShowCreate(false)}>キャンセル</Button>
              <Button variant="primary" onClick={handleCreate} loading={isCreating} disabled={!newName.trim()}>作成</Button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "24px" }}>
        {/* 左: KB一覧 */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {isLoading && [1, 2].map((i) => <div key={i} className="skeleton" style={{ height: "80px" }} />)}
          {!isLoading && kbs.length === 0 && (
            <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "13px" }}>
              ナレッジベースがありません
            </div>
          )}
          {kbs.map((kb) => (
            <button
              key={kb.id}
              onClick={() => { setSelectedKb(kb); fetchDocuments(kb.id); setShowUpload(false); setShowSearch(false); }}
              style={{
                padding: "14px 16px", borderRadius: "var(--radius-md)", textAlign: "left",
                background: selectedKb?.id === kb.id ? "var(--color-primary-light)" : "var(--color-surface)",
                border: `1px solid ${selectedKb?.id === kb.id ? "var(--color-primary)" : "var(--color-border)"}`,
                cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s ease",
                boxShadow: "var(--shadow-xs)",
              }}
            >
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text)", marginBottom: "4px" }}>{kb.name}</div>
              <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                {kb.document_count ?? 0}ドキュメント / {kb.chunk_count ?? 0}チャンク
              </div>
            </button>
          ))}
        </div>

        {/* 右: 詳細パネル */}
        <div style={{
          background: "var(--color-surface)", borderRadius: "var(--radius-lg)",
          border: "1px solid var(--color-border)", padding: "24px", minHeight: "400px",
          boxShadow: "var(--shadow-xs)",
        }}>
          {!selectedKb ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--color-text-muted)" }}>
              左からナレッジベースを選択してください
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h2 style={{ fontSize: "18px", fontWeight: 650 }}>{selectedKb.name}</h2>
                <div style={{ display: "flex", gap: "8px" }}>
                  <Button variant="secondary" size="sm" icon={<Search size={14} />} onClick={() => { setShowSearch(!showSearch); setShowUpload(false); }}>
                    検索テスト
                  </Button>
                  <Button variant="primary" size="sm" icon={<Upload size={14} />} onClick={() => { setShowUpload(!showUpload); setShowSearch(false); }}>
                    アップロード
                  </Button>
                </div>
              </div>

              {/* アップロードフォーム */}
              {showUpload && (
                <div style={{ padding: "16px", borderRadius: "var(--radius-md)", background: "var(--color-bg)", marginBottom: "20px", border: "1px solid var(--color-border)" }}>
                  {/* モード切替タブ */}
                  <div style={{ display: "flex", gap: "4px", marginBottom: "14px" }}>
                    {(["file", "text"] as const).map((mode) => (
                      <button key={mode} onClick={() => setUploadMode(mode)} style={{
                        padding: "6px 14px", borderRadius: "var(--radius-sm)", fontSize: "12px", fontWeight: 500,
                        border: `1px solid ${uploadMode === mode ? "var(--color-primary)" : "var(--color-border)"}`,
                        background: uploadMode === mode ? "var(--color-primary-light)" : "var(--color-surface)",
                        color: uploadMode === mode ? "var(--color-primary)" : "var(--color-text-secondary)",
                        cursor: "pointer", fontFamily: "inherit",
                      }}>
                        {mode === "file" ? "ファイルアップロード" : "テキスト貼り付け"}
                      </button>
                    ))}
                  </div>

                  {/* タイトル入力 */}
                  <input placeholder="ドキュメントタイトル（省略時はファイル名）" value={docTitle} onChange={(e) => setDocTitle(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", fontSize: "13px", fontFamily: "inherit", marginBottom: "12px" }} />

                  {uploadMode === "file" ? (
                    /* ファイルアップロードモード */
                    <div>
                      <label
                        style={{
                          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                          padding: "32px 16px", borderRadius: "var(--radius-md)",
                          border: "2px dashed var(--color-border)", background: "var(--color-surface)",
                          cursor: "pointer", transition: "all 0.2s ease", gap: "8px",
                        }}
                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--color-primary)"; }}
                        onDragLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.currentTarget.style.borderColor = "var(--color-border)";
                          const f = e.dataTransfer.files[0];
                          if (f) handleFileUpload(f);
                        }}
                      >
                        <Upload size={24} style={{ color: "var(--color-text-muted)" }} />
                        <span style={{ fontSize: "13px", color: "var(--color-text-secondary)", fontWeight: 500 }}>
                          クリックまたはドラッグ&ドロップ
                        </span>
                        <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                          対応形式: PDF, TXT, MD, CSV（最大10MB）
                        </span>
                        <input
                          type="file"
                          accept=".pdf,.txt,.md,.markdown,.csv"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleFileUpload(f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    /* テキスト貼り付けモード */
                    <div>
                      <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                        <select value={docType} onChange={(e) => setDocType(e.target.value as "text" | "markdown" | "csv")}
                          style={{ padding: "8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", fontSize: "13px", fontFamily: "inherit" }}>
                          <option value="text">テキスト</option>
                          <option value="markdown">Markdown</option>
                          <option value="csv">CSV</option>
                        </select>
                      </div>
                      <textarea placeholder="ドキュメントの内容をペースト..." value={docContent} onChange={(e) => setDocContent(e.target.value)}
                        rows={8} style={{ width: "100%", padding: "12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", fontSize: "13px", fontFamily: "inherit", resize: "vertical" }} />
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
                        <Button variant="primary" size="sm" onClick={handleUpload} loading={isUploading} disabled={!docContent.trim()}>
                          {isUploading ? "Embedding生成中..." : "アップロード"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* 結果表示 */}
                  {uploadResult && (
                    <div style={{ marginTop: "12px", padding: "10px", borderRadius: "var(--radius-sm)", fontSize: "13px",
                      background: uploadResult.startsWith("エラー") ? "rgba(239,68,68,0.06)" : "rgba(16,185,129,0.06)",
                      color: uploadResult.startsWith("エラー") ? "var(--color-error)" : "var(--color-success)",
                      border: `1px solid ${uploadResult.startsWith("エラー") ? "rgba(239,68,68,0.15)" : "rgba(16,185,129,0.15)"}`,
                    }}>
                      {isUploading ? "Embedding生成中... しばらくお待ちください" : uploadResult}
                    </div>
                  )}
                </div>
              )}

              {/* 検索テスト */}
              {showSearch && (
                <div style={{ padding: "16px", borderRadius: "var(--radius-md)", background: "var(--color-bg)", marginBottom: "20px", border: "1px solid var(--color-border)" }}>
                  <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                    <input placeholder="検索クエリを入力..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      style={{ flex: 1, padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", fontSize: "13px", fontFamily: "inherit" }} />
                    <Button variant="primary" size="sm" onClick={handleSearch} loading={isSearching}>検索</Button>
                  </div>
                  {searchResults.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {searchResults.map((r, i) => (
                        <div key={i} style={{ padding: "12px", borderRadius: "var(--radius-sm)", background: "var(--color-surface)", border: "1px solid var(--color-border)", fontSize: "13px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                            <span style={{ fontWeight: 600, color: "var(--color-text-secondary)" }}>{r.document_title}</span>
                            <span style={{ color: "var(--color-primary)", fontSize: "12px" }}>{(r.similarity * 100).toFixed(0)}% 一致</span>
                          </div>
                          <p style={{ color: "var(--color-text-muted)", lineHeight: 1.6 }}>{r.content.slice(0, 300)}{r.content.length > 300 ? "..." : ""}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* KB編集・削除 */}
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                <Button variant="ghost" size="sm" onClick={() => {
                  setEditingKbName(selectedKb.name);
                  setEditingKbDesc(selectedKb.description ?? "");
                  setIsEditingKb(!isEditingKb);
                }}>
                  {isEditingKb ? "キャンセル" : "KB編集"}
                </Button>
                <Button variant="danger" size="sm" icon={<Trash2 size={13} />} onClick={handleDeleteKb}>
                  KB削除
                </Button>
              </div>

              {isEditingKb && (
                <div style={{ padding: "12px", borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-border)", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <input value={editingKbName} onChange={(e) => setEditingKbName(e.target.value)} placeholder="名前"
                    style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", fontSize: "13px", fontFamily: "inherit" }} />
                  <input value={editingKbDesc} onChange={(e) => setEditingKbDesc(e.target.value)} placeholder="説明"
                    style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", fontSize: "13px", fontFamily: "inherit" }} />
                  <Button variant="primary" size="sm" onClick={handleEditKb} disabled={!editingKbName.trim()}>保存</Button>
                </div>
              )}

              {/* ドキュメント一覧 */}
              <div>
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: "12px" }}>
                  ドキュメント ({documents.length})
                </h3>
                {documents.length === 0 ? (
                  <p style={{ color: "var(--color-text-muted)", fontSize: "13px", padding: "20px", textAlign: "center" }}>
                    ドキュメントがありません。上のボタンからアップロードしてください。
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {documents.map((doc) => (
                      <div key={doc.id} style={{
                        padding: "12px 16px", borderRadius: "var(--radius-sm)",
                        border: `1px solid ${previewDoc?.id === doc.id ? "var(--color-primary)" : "var(--color-border)"}`,
                        background: previewDoc?.id === doc.id ? "var(--color-primary-light)" : "var(--color-bg)",
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        cursor: "pointer", transition: "all 0.15s ease",
                      }}
                        onClick={() => handlePreviewDoc(doc)}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <FileText size={14} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
                            <span style={{ fontSize: "13px", fontWeight: 550, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</span>
                            <span className="badge" style={{
                              fontSize: "10px", flexShrink: 0,
                              color: doc.status === "ready" ? "var(--color-success)" : doc.status === "error" ? "var(--color-error)" : "var(--color-warning)",
                              background: doc.status === "ready" ? "rgba(16,185,129,0.08)" : doc.status === "error" ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)",
                            }}>
                              {doc.status === "ready" ? "完了" : doc.status === "error" ? "エラー" : "処理中"}
                            </span>
                          </div>
                          <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "2px" }}>
                            {doc.chunk_count}チャンク / {doc.token_count}トークン / {doc.source_type}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteDoc(doc.id, doc.title); }}
                          style={{ padding: "6px", borderRadius: "var(--radius-sm)", background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-muted)", flexShrink: 0 }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-error)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-muted)"; }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ドキュメントプレビューパネル */}
      {previewDoc && (
        <div style={{ marginTop: "24px" }} className="animate-in">
          <div style={{
            background: "var(--color-surface)", borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-border)", boxShadow: "var(--shadow-md)",
            overflow: "hidden",
          }}>
            {/* ヘッダー */}
            <div style={{
              padding: "16px 24px", borderBottom: "1px solid var(--color-border)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "var(--color-surface-2)",
            }}>
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: 650, color: "var(--color-text)" }}>{previewDoc.title}</h3>
                <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "2px" }}>
                  {previewDoc.source_type} / {previewDoc.chunk_count}チャンク / {previewDoc.token_count}トークン
                  {previewDoc.metadata && typeof (previewDoc.metadata as Record<string, string>).original_filename === "string" && (
                    <span> / {(previewDoc.metadata as Record<string, string>).original_filename}</span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                {!isEditingDoc ? (
                  <Button variant="secondary" size="sm" onClick={startEditDoc}>
                    編集
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => { setIsEditingDoc(false); setSaveDocResult(null); }}>
                    キャンセル
                  </Button>
                )}
                <button onClick={closePreview} style={{
                  padding: "6px 12px", borderRadius: "var(--radius-sm)", background: "transparent",
                  border: "1px solid var(--color-border)", color: "var(--color-text-muted)",
                  cursor: "pointer", fontSize: "12px", fontFamily: "inherit",
                }}>
                  閉じる
                </button>
              </div>
            </div>

            {/* タブ */}
            <div style={{ display: "flex", gap: "0", borderBottom: "1px solid var(--color-border)" }}>
              {(["content", "chunks"] as const).map((tab) => (
                <button key={tab} onClick={() => setPreviewTab(tab)} style={{
                  padding: "10px 20px", fontSize: "13px", fontWeight: previewTab === tab ? 600 : 400,
                  color: previewTab === tab ? "var(--color-primary)" : "var(--color-text-muted)",
                  background: "transparent", border: "none",
                  borderBottom: previewTab === tab ? "2px solid var(--color-primary)" : "2px solid transparent",
                  cursor: "pointer", fontFamily: "inherit", marginBottom: "-1px",
                }}>
                  {tab === "content" ? "原文" : `チャンク (${previewChunks.length})`}
                </button>
              ))}
            </div>

            {/* コンテンツ */}
            <div style={{ padding: "24px", maxHeight: "500px", overflowY: "auto" }}>
              {isLoadingPreview ? (
                <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-muted)" }}>
                  <Loader2 size={24} style={{ animation: "spin 1s linear infinite", marginBottom: "8px" }} />
                  <p>読み込み中...</p>
                </div>
              ) : previewTab === "content" ? (
                /* 原文タブ — 表示モード or 編集モード */
                isEditingDoc ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <input
                      value={editDocTitle}
                      onChange={(e) => setEditDocTitle(e.target.value)}
                      placeholder="ドキュメントタイトル"
                      style={{
                        padding: "10px 14px", borderRadius: "var(--radius-md)",
                        border: "1px solid var(--color-border)", background: "var(--color-surface)",
                        color: "var(--color-text)", fontSize: "14px", fontFamily: "inherit", fontWeight: 600,
                      }}
                    />
                    <textarea
                      value={editDocContent}
                      onChange={(e) => setEditDocContent(e.target.value)}
                      rows={18}
                      style={{
                        width: "100%", padding: "14px", borderRadius: "var(--radius-md)",
                        border: "1px solid var(--color-border)", background: "var(--color-surface)",
                        color: "var(--color-text)", fontSize: "13px", fontFamily: "'SF Mono', 'Menlo', monospace",
                        lineHeight: 1.7, resize: "vertical",
                      }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                        保存すると再チャンク + 再Embeddingが実行されます
                      </span>
                      <Button variant="primary" size="sm" onClick={handleSaveDoc} loading={isSavingDoc} disabled={!editDocContent.trim()}>
                        {isSavingDoc ? "再Embedding生成中..." : "保存して再生成"}
                      </Button>
                    </div>
                    {saveDocResult && (
                      <div style={{
                        padding: "10px", borderRadius: "var(--radius-sm)", fontSize: "13px",
                        background: saveDocResult.startsWith("エラー") ? "rgba(239,68,68,0.06)" : "rgba(16,185,129,0.06)",
                        color: saveDocResult.startsWith("エラー") ? "var(--color-error)" : "var(--color-success)",
                      }}>
                        {saveDocResult}
                      </div>
                    )}
                  </div>
                ) : (
                  <pre style={{
                    whiteSpace: "pre-wrap", wordBreak: "break-word",
                    fontSize: "13px", lineHeight: 1.7, color: "var(--color-text-secondary)",
                    fontFamily: "inherit", margin: 0,
                  }}>
                    {previewDoc.original_content ?? "(原文データなし)"}
                  </pre>
                )
              ) : (
                /* チャンクタブ */
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {previewChunks.map((chunk) => (
                    <div key={chunk.id} style={{
                      padding: "14px 16px", borderRadius: "var(--radius-md)",
                      border: "1px solid var(--color-border)", background: "var(--color-bg)",
                    }}>
                      <div style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        marginBottom: "8px", paddingBottom: "8px", borderBottom: "1px solid var(--color-border)",
                      }}>
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-primary)" }}>
                          チャンク #{chunk.chunk_index + 1}
                        </span>
                        <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                          {chunk.token_count} tokens
                        </span>
                      </div>
                      <p style={{
                        fontSize: "13px", lineHeight: 1.7, color: "var(--color-text-secondary)",
                        margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word",
                      }}>
                        {chunk.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
