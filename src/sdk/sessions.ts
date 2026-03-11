import { createHash } from "node:crypto";
import { config } from "../config.js";

export interface SessionEntry {
  sdkSessionId: string;
  model: string;
  createdAt: number;
  lastUsedAt: number;
  messageCount: number;
}

const sessions = new Map<string, SessionEntry>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Hash the message prefix (all messages except the last) to derive a
 * deterministic conversation ID. Two requests with the same conversation
 * history will map to the same session.
 */
export function hashMessagePrefix(
  messages: Array<{ role: string; content: unknown }>,
): string | null {
  if (messages.length < 2) return null;

  const prefix = messages.slice(0, -1);
  const serialized = JSON.stringify(prefix);
  return createHash("sha256").update(serialized).digest("hex").slice(0, 16);
}

/**
 * Resolve a conversation ID from:
 * 1. Explicit X-Conversation-Id header
 * 2. Hash of message prefix (messages[0..n-2])
 * 3. null (new session)
 */
export function resolveConversationId(
  header: string | undefined,
  messages: Array<{ role: string; content: unknown }>,
): string | null {
  if (header) return header;
  return hashMessagePrefix(messages);
}

export function getSession(conversationId: string): SessionEntry | undefined {
  return sessions.get(conversationId);
}

export function setSession(
  conversationId: string,
  entry: SessionEntry,
): void {
  sessions.set(conversationId, entry);
}

export function updateSessionUsage(
  conversationId: string,
  messageCount?: number,
): void {
  const entry = sessions.get(conversationId);
  if (entry) {
    entry.lastUsedAt = Date.now();
    if (messageCount !== undefined) {
      entry.messageCount = messageCount;
    }
  }
}

export function deleteSession(conversationId: string): boolean {
  return sessions.delete(conversationId);
}

export function getSessionCount(): number {
  return sessions.size;
}

/**
 * Remove sessions that haven't been used within the TTL window.
 */
export function cleanupExpiredSessions(): number {
  const ttlMs = config.sessionTtlHours * 60 * 60 * 1000;
  const cutoff = Date.now() - ttlMs;
  let removed = 0;

  for (const [id, entry] of sessions) {
    if (entry.lastUsedAt < cutoff) {
      sessions.delete(id);
      removed++;
    }
  }

  return removed;
}

export function startCleanupInterval(intervalMs = 60 * 60 * 1000): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(cleanupExpiredSessions, intervalMs);
  // Don't block process exit
  if (cleanupTimer.unref) cleanupTimer.unref();
}

export function stopCleanupInterval(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

/** Clear all sessions (for testing). */
export function clearAllSessions(): void {
  sessions.clear();
}
