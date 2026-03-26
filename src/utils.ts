import type { FigNode } from "./types.js";

/**
 * Returns the string ID for a node ("sessionID:localID"), or null if no guid.
 */
export function nodeId(node: FigNode): string | null {
  if (!node?.guid) return null;
  return `${node.guid.sessionID}:${node.guid.localID}`;
}
