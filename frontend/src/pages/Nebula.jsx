import React, { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react';
import NebulaCanvas from '../canvas/NebulaCanvas';
import TagPanel from '../components/TagPanel';
import NodePanel from '../components/NodePanel';

const GraphCanvas = lazy(() => import('../canvas/GraphCanvas'));

/* ============================================================
   Nebula — Room 2: "Your knowledge as a sky."

   Fetches tags + items and renders them as a constellation.
   Tags are stars; relational threads connect them to items.
   Also includes a Semantic Mind Map mode showing full connected
   similarity graph with semantic hubs.
   ============================================================ */
function layoutNodes(nodes, edges, hubs) {
  const width = 1200;
  const height = 900;
  const centerX = width / 2;
  const centerY = height / 2;

  const hubNodes = [];
  const orbitalNodes = [];

  // 1. Categorize nodes
  nodes.forEach(node => {
    if (node.id < 0 || node.type === 'hub') {
      node.type = 'hub';
      hubNodes.push(node);
    } else {
      node.type = 'orbital';
      orbitalNodes.push(node);
    }
  });

  // Ensure at least one hub if possible
  if (hubNodes.length === 0 && orbitalNodes.length > 0) {
    const first = orbitalNodes.shift();
    first.type = 'hub';
    hubNodes.push(first);
  }

  // 2. Position hubs in a circle around the center
  hubNodes.forEach((hub, i) => {
    const angle = hubNodes.length > 1 ? (i / hubNodes.length) * 2 * Math.PI : 0;
    const radius = hubNodes.length > 1 ? 250 : 0; // Spread hubs wider apart (250px)
    hub.x = centerX + radius * Math.cos(angle);
    hub.y = centerY + radius * Math.sin(angle);
    hub.vx = 0; hub.vy = 0;
  });

  // Create a mapping of member item ID to its parent hub node
  const memberHubMap = {};
  hubs.forEach(hub => {
    const hubNodeId = -hub.id;
    const hubNode = hubNodes.find(hn => hn.id === hubNodeId);
    if (hubNode) {
      if (hub.updated_at) {
        hubNode.updated_at = hub.updated_at;
      }
      if (hub.member_ids) {
        hub.member_ids.forEach(mid => {
          memberHubMap[mid] = hubNode;
        });
      }
    }
  });

  // 3. Position orbitals: either around their hub or around the center (singletons)
  const hubMemberIndices = {};
  let singletonCount = 0;

  orbitalNodes.forEach((node) => {
    const parentHub = memberHubMap[node.id];
    if (parentHub) {
      // Node belongs to a hub. Position in a local Fermat spiral around the hub centroid.
      const localIndex = hubMemberIndices[parentHub.id] || 0;
      hubMemberIndices[parentHub.id] = localIndex + 1;

      const localC = 35; // Local spacing factor
      const n = localIndex + 2; // Offset from centroid core
      const angle = n * 137.508 * (Math.PI / 180);
      const radius = localC * Math.sqrt(n);

      node.x = parentHub.x + radius * Math.cos(angle);
      node.y = parentHub.y + radius * Math.sin(angle);
    } else {
      // Node is a singleton. Position in a global spiral around the center.
      const localIndex = singletonCount;
      singletonCount++;

      const n = localIndex + 12; // Start outside the central core
      const angle = n * 137.508 * (Math.PI / 180);
      const radius = 80 + 25 * Math.sqrt(n);

      node.x = centerX + radius * Math.cos(angle);
      node.y = centerY + radius * Math.sin(angle);
    }
    node.vx = 0;
    node.vy = 0;
  });

  // Bound within canvas area to prevent going off-screen
  nodes.forEach(node => {
    node.x = Math.max(60, Math.min(width - 60, node.x));
    node.y = Math.max(60, Math.min(height - 60, node.y));
  });

  return nodes;
}

/* ============================================================
   Nebula — Room 2: "Your knowledge as a sky."

   Fetches tags + items and renders them as a constellation.
   Tags are stars; relational threads connect them to items.
   Also includes a Semantic Mind Map mode showing full connected
   similarity graph of files around semantic hubs.
   ============================================================ */
export default function Nebula() {
  const [viewMode, setViewMode] = useState('tags'); // 'tags' | 'graph'
  const [tags, setTags] = useState([]);
  const [items, setItems] = useState([]);
  const [graphNodes, setGraphNodes] = useState([]);
  const [graphEdges, setGraphEdges] = useState([]);
  const [graphHubs, setGraphHubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTag, setSelectedTag] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  /* ── Fetch tags and items from API ──────────────────────────────────── */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // 1. Fetch all items sequentially (up to 300 max) to ensure full dataset coverage
      let fetchedItems = [];
      let pageNum = 1;
      let hasMore = true;
      while (hasMore && pageNum <= 6) {
        const res = await fetch(`/api/items?page=${pageNum}&limit=50`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const fetched = data.items || data || [];

        if (fetched.length === 0) {
          hasMore = false;
        } else {
          fetchedItems = [...fetchedItems, ...fetched];
          if (fetched.length < 50) {
            hasMore = false;
          } else {
            pageNum++;
          }
        }
      }
      setItems(fetchedItems);

      // Extract tags from items
      const tagMap = {};
      fetchedItems.forEach((item) => {
        (item.tags || []).forEach((tag) => {
          if (!tagMap[tag]) tagMap[tag] = { name: tag, items: [] };
          tagMap[tag].items.push(item);
        });
      });
      setTags(Object.values(tagMap));

      // 2. Fetch Mind Map Graph
      const graphRes = await fetch('/api/graph');
      if (graphRes.ok) {
        const graphData = await graphRes.json();
        const rawNodes = graphData.nodes || [];
        const rawEdges = graphData.edges || [];
        const rawHubs = graphData.hubs || [];

        // 1. Enrich item nodes with summary/tags details
        const enrichedNodes = rawNodes.map(node => {
          const details = fetchedItems.find(it => it.id === node.id);
          return {
            ...node,
            summary: details?.summary || node.summary || 'No summary generated.',
            tags: details?.tags || node.tags || [],
            source_url: details?.source_url || node.source_url || ''
          };
        });

        // 2. Construct virtual semantic hub nodes
        const valid_item_ids = new Set(enrichedNodes.map(node => node.id));
        const finalNodes = [...enrichedNodes];
        rawHubs.forEach(hub => {
          if (hub.member_ids && hub.member_ids.length > 0) {
            const hasVisibleMember = hub.member_ids.some(mid => valid_item_ids.has(mid));
            if (hasVisibleMember) {
              const hubNodeId = -hub.id;
              finalNodes.push({
                id: hubNodeId,
                title: hub.label,
                source_type: 'hub',
                created_at: new Date().toISOString(),
                is_hub: true,
                type: 'hub',
                summary: `Semantic cluster containing: ${hub.label}`,
                tags: ['hub', 'semantic'],
                source_url: ''
              });
            }
          }
        });

        // 3. Construct edges between hubs and files
        const finalEdges = [...rawEdges];
        rawHubs.forEach(hub => {
          if (hub.member_ids && hub.member_ids.length > 0) {
            const hubNodeId = -hub.id;
            hub.member_ids.forEach(mid => {
              if (valid_item_ids.has(mid)) {
                finalEdges.push({
                  source: hubNodeId,
                  target: mid,
                  weight: 1.0
                });
              }
            });
          }
        });

        // 4. Compute and seed initial layout coordinates
        const positioned = layoutNodes(finalNodes, finalEdges, rawHubs);

        setGraphNodes(positioned);
        setGraphEdges(finalEdges);
        setGraphHubs(rawHubs);
      }

      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);


  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const handler = () => fetchData();
    window.addEventListener('online-refetch', handler);
    return () => window.removeEventListener('online-refetch', handler);
  }, [fetchData]);

  const handleTagClick = useCallback((tag) => {
    setSelectedTag(tag);
  }, []);

  const handlePanelClose = useCallback(() => {
    setSelectedTag(null);
  }, []);

  const hasData = viewMode === 'tags' ? tags.length > 0 : graphNodes.length > 0;

  return (
    <div
      className="nebula-room"
      style={{
        width: '100%',
        height: '100vh',
        position: 'relative',
        background: 'var(--bg-void)',
        overflow: 'hidden',
      }}
    >
      {/* ── Faint amber-violet nebula gradient background ── */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: [
          'radial-gradient(ellipse 80% 60% at 30% 40%, rgba(158,136,161,0.06) 0%, transparent 60%)',
          'radial-gradient(ellipse 60% 80% at 70% 70%, rgba(207,163,101,0.04) 0%, transparent 60%)',
        ].join(', '),
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      {/* ── View Toggle (top right control deck) ── */}
      {!loading && !error && (
        <div style={{
          position: 'absolute',
          top: '2.5rem',
          right: '2.5rem',
          zIndex: 100,
          display: 'flex',
          background: 'rgba(17, 15, 20, 0.85)',
          border: '1px solid rgba(244, 239, 235, 0.08)',
          borderRadius: '30px',
          padding: '3px',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}>
          {[
            { id: 'tags', label: 'Tags Constellation' },
            { id: 'graph', label: 'Semantic Mind Map' }
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => setViewMode(mode.id)}
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: '25px',
                border: 'none',
                background: viewMode === mode.id ? 'var(--accent-gold)' : 'transparent',
                color: viewMode === mode.id ? '#000' : 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              {mode.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Canvas Mounts ── */}
      {hasData && (
        viewMode === 'tags' ? (
          <NebulaCanvas
            tags={tags}
            items={items}
            loading={loading}
            onTagClick={handleTagClick}
            selectedTag={selectedTag}
          />
        ) : (
          <Suspense fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              ALIGNING NEURAL MAP…
            </div>
          }>
            <GraphCanvas
              activeNodes={graphNodes}
              edges={graphEdges}
              hubs={graphHubs}
              mode="graph"
              selectedNodeId={selectedNode?.id}
              onNodeClick={(node) => {
                const fullItem = items.find(it => it.id === node.id);
                if (fullItem) setSelectedNode(fullItem);
              }}
            />
          </Suspense>
        )
      )}

      {/* ── Tag detail panel (tags mode) ── */}
      {selectedTag && viewMode === 'tags' && (
        <TagPanel
          tag={selectedTag}
          onClose={handlePanelClose}
        />
      )}

      {/* ── Node detail panel (mind map mode) ── */}
      {selectedNode && viewMode === 'graph' && (
        <NodePanel
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
          onDelete={(id) => {
            setGraphNodes(prev => prev.filter(n => n.id !== id));
            setItems(prev => prev.filter(it => it.id !== id));
            setSelectedNode(null);
          }}
        />
      )}


      {/* ── Error state ── */}
      {error && !loading && (
        <div style={{
          position: 'absolute',
          bottom: '2rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(180, 84, 84, 0.1)',
          border: '1px solid rgba(180, 84, 84, 0.3)',
          borderRadius: 8,
          padding: '0.75rem 1.25rem',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: '#e07070',
          letterSpacing: '0.06em',
          zIndex: 10,
        }}>
          NEBULA OFFLINE — {error}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !error && !hasData && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          alignItems: 'center',
          zIndex: 10,
        }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: '4rem',
            color: 'var(--accent-gold)',
            opacity: 0.3,
          }}>✦</div>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-muted)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}>No data mapped yet.</p>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--text-muted)',
            maxWidth: 300,
            lineHeight: 1.6,
          }}>
            Save tagged items via Telegram to see your knowledge map appear here.
          </p>
        </div>
      )}
    </div>
  );
}

