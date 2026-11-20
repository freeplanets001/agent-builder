"use client";

import { useState, useCallback } from "react";
import type { FlowNode, FlowEdge, FlowNodeType, FlowEdgeType } from "@/lib/types";

interface FlowEditorProps {
  flowId: string;
  initialNodes?: FlowNode[];
  initialEdges?: FlowEdge[];
  onSave?: (nodes: FlowNode[], edges: FlowEdge[]) => void;
}

/** ノード種別のラベルと色 */
const NODE_TYPES: Record<FlowNodeType, { label: string; color: string; icon: string }> = {
  start: { label: "開始", color: "#22c55e", icon: "▶" },
  agent: { label: "エージェント", color: "#3b82f6", icon: "🤖" },
  condition: { label: "条件分岐", color: "#f59e0b", icon: "◇" },
  parallel: { label: "並列", color: "#8b5cf6", icon: "⫸" },
  merge: { label: "合流", color: "#8b5cf6", icon: "⫷" },
  human: { label: "人間判断", color: "#ec4899", icon: "👤" },
  end: { label: "終了", color: "#ef4444", icon: "⏹" },
};

export default function FlowEditor({ flowId, initialNodes = [], initialEdges = [], onSave }: FlowEditorProps) {
  const [nodes, setNodes] = useState<FlowNode[]>(initialNodes);
  const [edges, setEdges] = useState<FlowEdge[]>(initialEdges);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);

  /** ノードを追加 */
  const addNode = useCallback((type: FlowNodeType) => {
    const newNode: FlowNode = {
      id: crypto.randomUUID(),
      flow_id: flowId,
      type,
      position: {
        x: 100 + Math.random() * 400,
        y: 100 + nodes.length * 120,
      },
      data: {},
      created_at: new Date().toISOString(),
    };
    setNodes((prev) => [...prev, newNode]);
  }, [flowId, nodes.length]);

  /** ノードを削除 */
  const deleteNode = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.source_node_id !== nodeId && e.target_node_id !== nodeId));
    if (selectedNode === nodeId) setSelectedNode(null);
  }, [selectedNode]);

  /** エッジを追加（ノードクリック接続） */
  const handleNodeClick = useCallback((nodeId: string) => {
    if (connecting) {
      if (connecting !== nodeId) {
        const newEdge: FlowEdge = {
          id: crypto.randomUUID(),
          flow_id: flowId,
          source_node_id: connecting,
          target_node_id: nodeId,
          type: "normal" as FlowEdgeType,
          created_at: new Date().toISOString(),
        };
        setEdges((prev) => [...prev, newEdge]);
      }
      setConnecting(null);
    } else {
      setSelectedNode(nodeId);
    }
  }, [connecting, flowId]);

  /** 保存 */
  const handleSave = useCallback(() => {
    onSave?.(nodes, edges);
  }, [nodes, edges, onSave]);

  return (
    <div className="flex flex-col h-full">
      {/* ツールバー */}
      <div className="flex items-center gap-2 p-3 border-b border-zinc-700 bg-zinc-900 flex-wrap">
        <span className="text-sm text-zinc-400 mr-2">ノード追加:</span>
        {(Object.entries(NODE_TYPES) as Array<[FlowNodeType, { label: string; icon: string }]>).map(([type, { label, icon }]) => (
          <button
            key={type}
            onClick={() => addNode(type)}
            className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-600 transition-colors"
          >
            {icon} {label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setConnecting(connecting ? null : selectedNode)}
          className={`px-3 py-1 text-xs rounded border transition-colors ${
            connecting ? "bg-blue-600 border-blue-500 text-white" : "bg-zinc-800 border-zinc-600 hover:bg-zinc-700"
          }`}
        >
          {connecting ? "接続中..." : "接続"}
        </button>
        <button
          onClick={handleSave}
          className="px-3 py-1 text-xs bg-green-600 hover:bg-green-500 rounded text-white transition-colors"
        >
          保存
        </button>
      </div>

      {/* キャンバス */}
      <div className="flex-1 relative overflow-auto bg-zinc-950 min-h-[400px]">
        {/* エッジ描画（SVG） */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ minWidth: 800, minHeight: 600 }}>
          {edges.map((edge) => {
            const source = nodes.find((n) => n.id === edge.source_node_id);
            const target = nodes.find((n) => n.id === edge.target_node_id);
            if (!source || !target) return null;

            const sx = source.position.x + 100;
            const sy = source.position.y + 30;
            const tx = target.position.x + 100;
            const ty = target.position.y + 30;

            const edgeColor = edge.type === "true" ? "#22c55e" : edge.type === "false" ? "#ef4444" : edge.type === "error" ? "#f59e0b" : "#6b7280";

            return (
              <g key={edge.id}>
                <line x1={sx} y1={sy} x2={tx} y2={ty} stroke={edgeColor} strokeWidth={2} markerEnd="url(#arrowhead)" />
                {edge.label && (
                  <text x={(sx + tx) / 2} y={(sy + ty) / 2 - 8} fill="#9ca3af" fontSize={10} textAnchor="middle">
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
            </marker>
          </defs>
        </svg>

        {/* ノード描画 */}
        {nodes.map((node) => {
          const config = NODE_TYPES[node.type];
          const isSelected = selectedNode === node.id;
          const isConnecting = connecting === node.id;

          return (
            <div
              key={node.id}
              onClick={() => handleNodeClick(node.id)}
              className={`absolute cursor-pointer select-none rounded-lg border-2 px-4 py-2 min-w-[160px] text-center transition-all ${
                isSelected ? "ring-2 ring-blue-400" : ""
              } ${isConnecting ? "ring-2 ring-yellow-400" : ""}`}
              style={{
                left: node.position.x,
                top: node.position.y,
                borderColor: config.color,
                backgroundColor: `${config.color}20`,
              }}
            >
              <div className="text-lg">{config.icon}</div>
              <div className="text-xs font-medium" style={{ color: config.color }}>{config.label}</div>
              {node.agent_id && <div className="text-[10px] text-zinc-400 mt-1 truncate">Agent: {node.agent_id.slice(0, 8)}...</div>}
              {node.condition && <div className="text-[10px] text-zinc-400 mt-1 truncate">条件: {node.condition}</div>}
              <button
                onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }}
                className="absolute -top-2 -right-2 w-5 h-5 bg-red-600 rounded-full text-[10px] text-white hover:bg-red-500"
              >
                ×
              </button>
            </div>
          );
        })}

        {nodes.length === 0 && (
          <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
            上のツールバーからノードを追加してフローを構築してください
          </div>
        )}
      </div>
    </div>
  );
}
