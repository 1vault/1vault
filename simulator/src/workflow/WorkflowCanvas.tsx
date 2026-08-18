import { useEffect, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { buildEdges, buildNodes, LAYOUT_REV, type NodeView } from "./graph";
import type { WorkflowNodeId } from "../../shared/events";
import WalletNode from "./nodes/WalletNode";
import ProcessNode from "./nodes/ProcessNode";
import ProtocolNode from "./nodes/ProtocolNode";
import SinkNode from "./nodes/SinkNode";
import SettingsNode from "./nodes/SettingsNode";

const nodeTypes = {
  wallet: WalletNode,
  process: ProcessNode,
  protocol: ProtocolNode,
  sink: SinkNode,
  settings: SettingsNode,
};

function withViews(nodes: Node[], views: Record<WorkflowNodeId, NodeView>): Node[] {
  return nodes.map((node) => {
    const view = views[node.id as WorkflowNodeId];
    return {
      ...node,
      data: { ...node.data, view },
      className: `rf-node status-${view.status}`,
    };
  });
}

function Canvas({ views }: { views: Record<WorkflowNodeId, NodeView> }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(withViews(buildNodes(), views));
  const [edges, setEdges, onEdgesChange] = useEdgesState(buildEdges(views));
  const { fitView } = useReactFlow();

  useEffect(() => {
    setNodes((current) => {
      const built = withViews(buildNodes(), views);
      const positions = new Map(current.map((n) => [n.id, n.position]));
      return built.map((n) => ({
        ...n,
        position: positions.get(n.id) ?? n.position,
      }));
    });
    setEdges(buildEdges(views));
  }, [views, setNodes, setEdges]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void fitView({ padding: 0.1, minZoom: 0.22, maxZoom: 1.05, duration: 220 });
    }, 80);
    return () => window.clearTimeout(id);
  }, [fitView]);

  const typedNodes = useMemo(() => nodes, [nodes]);

  return (
    <ReactFlow
      nodes={typedNodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      colorMode="dark"
      minZoom={0.2}
      maxZoom={1.6}
      fitView
      fitViewOptions={{ padding: 0.14, minZoom: 0.2, maxZoom: 1.05 }}
      defaultEdgeOptions={{ type: "smoothstep" }}
      panOnScroll
      zoomOnScroll
      nodesConnectable={false}
      nodesDraggable
      elementsSelectable
      deleteKeyCode={null}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#1a4d6b" />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        maskColor="rgba(5, 12, 20, 0.72)"
        nodeColor="#093C5D"
        className="nv-minimap"
      />
    </ReactFlow>
  );
}

export default function WorkflowCanvas({
  views,
}: {
  views: Record<WorkflowNodeId, NodeView>;
}) {
  return (
    <div className="canvas-inner">
      <ReactFlowProvider key={LAYOUT_REV}>
        <Canvas views={views} />
      </ReactFlowProvider>
    </div>
  );
}
