import type { Metadata } from "next";
import PipelineDashboard from "@/components/pipelines/PipelineDashboard";

export const metadata: Metadata = {
  title: "パイプライン",
};

export default function PipelinesPage() {
  return (
    <div style={{ padding: "32px", maxWidth: "1200px" }}>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, letterSpacing: "-0.5px" }}>
          パイプライン
        </h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: "14px", marginTop: "4px" }}>
          複数のエージェントを連鎖実行して複雑なタスクを処理
        </p>
      </div>
      <PipelineDashboard />
    </div>
  );
}
