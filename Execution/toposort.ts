export function buildLayeredTopoSort<T extends string | number>(
  items: { id: T }[],
  edges: { fromId: T; toId: T }[],
): T[][] {
  if (items.length === 0) {
    throw new Error("No items found. At least one item is required.");
  }

  const adjList = new Map<T, Set<T>>();
  const indegree = new Map<T, number>();

  for (const item of items) {
    indegree.set(item.id, 0);
    adjList.set(item.id, new Set());
  }

  for (const edge of edges) {
    if (edge.fromId !== edge.toId) {
      if (!adjList.get(edge.fromId)?.has(edge.toId)) {
        adjList.get(edge.fromId)!.add(edge.toId);
        indegree.set(edge.toId, (indegree.get(edge.toId) || 0) + 1);
      }
    }
  }

  const layers: T[][] = [];
  let currentLayer: T[] = [];

  for (const [id, deg] of indegree.entries()) {
    if (deg === 0) currentLayer.push(id);
  }

  while (currentLayer.length > 0) {
    layers.push(currentLayer);
    const nextLayer: T[] = [];
    for (const id of currentLayer) {
      for (const neighbor of adjList.get(id) || []) {
        const newDeg = (indegree.get(neighbor) || 0) - 1;
        indegree.set(neighbor, newDeg);
        if (newDeg === 0) nextLayer.push(neighbor);
      }
    }
    currentLayer = nextLayer;
  }

  const totalVisited = layers.flat().length;
  if (totalVisited !== items.length) {
    throw new Error("Cycle detected in graph!");
  }

  return layers;
}
