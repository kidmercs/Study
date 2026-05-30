import React, { useState } from "react";

interface MindMapNode {
  label: string;
  children?: MindMapNode[];
}

interface MindMapViewProps {
  mindMapJson: string | null;
}

const BRANCH_COLORS = [
  "bg-blue-100 border-blue-300 text-blue-800",
  "bg-purple-100 border-purple-300 text-purple-800",
  "bg-emerald-100 border-emerald-300 text-emerald-800",
  "bg-amber-100 border-amber-300 text-amber-800",
  "bg-rose-100 border-rose-300 text-rose-800",
  "bg-cyan-100 border-cyan-300 text-cyan-800",
  "bg-indigo-100 border-indigo-300 text-indigo-800",
];

function LeafNode({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <div className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${colorClass} whitespace-nowrap max-w-[160px] truncate`} title={label}>
      {label}
    </div>
  );
}

function BranchNode({
  node,
  colorClass,
  depth,
}: {
  node: MindMapNode;
  colorClass: string;
  depth: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-start">
        <button
          onClick={() => hasChildren && setCollapsed(!collapsed)}
          className={[
            "px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all",
            hasChildren ? "cursor-pointer hover:opacity-80" : "cursor-default",
            depth === 1
              ? `${colorClass} shadow-sm`
              : "bg-muted/60 border-border text-foreground text-xs px-3 py-1.5",
          ].join(" ")}
          title={node.label}
        >
          <span className="max-w-[150px] truncate block">{node.label}</span>
        </button>
      </div>

      {hasChildren && !collapsed && (
        <div className="flex flex-col gap-2 relative pl-4 border-l-2 border-border/50 ml-1">
          {node.children!.map((child, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-3 h-px bg-border/50" />
              {child.children && child.children.length > 0 ? (
                <BranchNode node={child} colorClass={colorClass} depth={depth + 1} />
              ) : (
                <LeafNode label={child.label} colorClass={colorClass} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MindMapView({ mindMapJson }: MindMapViewProps) {
  if (!mindMapJson) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        No mind map available for this source.
      </div>
    );
  }

  let root: MindMapNode;
  try {
    root = JSON.parse(mindMapJson) as MindMapNode;
  } catch {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Mind map data is unavailable.
      </div>
    );
  }

  const children = root.children ?? [];

  return (
    <div className="w-full overflow-x-auto pb-4">
      <div className="min-w-fit mx-auto px-4">
        <div className="flex flex-col items-center gap-6">
          {/* Root node */}
          <div className="px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-base shadow-md text-center max-w-xs">
            {root.label}
          </div>

          {/* Connector line */}
          {children.length > 0 && (
            <div className="w-px h-6 bg-border" />
          )}

          {/* Branches */}
          {children.length > 0 && (
            <div className="flex flex-wrap justify-center gap-6">
              {children.map((branch, i) => (
                <div key={i} className="flex flex-col items-start gap-1">
                  <BranchNode
                    node={branch}
                    colorClass={BRANCH_COLORS[i % BRANCH_COLORS.length]}
                    depth={1}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
