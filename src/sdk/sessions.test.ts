import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  hashMessagePrefix,
  resolveConversationId,
  getSession,
  setSession,
  updateSessionUsage,
  deleteSession,
  getSessionCount,
  cleanupExpiredSessions,
  startCleanupInterval,
  stopCleanupInterval,
  clearAllSessions,
  type SessionEntry,
} from "./sessions.js";

function makeEntry(overrides?: Partial<SessionEntry>): SessionEntry {
  return {
    sdkSessionId: "sdk-123",
    model: "claude-sonnet-4-6",
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    messageCount: 2,
    ...overrides,
  };
}

describe("sessions", () => {
  beforeEach(() => {
    clearAllSessions();
  });

  afterEach(() => {
    stopCleanupInterval();
    clearAllSessions();
  });

  describe("hashMessagePrefix", () => {
    it("returns null for single message", () => {
      expect(hashMessagePrefix([{ role: "user", content: "hi" }])).toBeNull();
    });

    it("returns hash for multi-message array", () => {
      const messages = [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
        { role: "user", content: "how are you?" },
      ];
      const hash = hashMessagePrefix(messages);
      expect(hash).toBeTypeOf("string");
      expect(hash!.length).toBe(16);
    });

    it("same prefix produces same hash", () => {
      const messages1 = [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
        { role: "user", content: "question 1" },
      ];
      const messages2 = [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
        { role: "user", content: "question 2" },
      ];
      expect(hashMessagePrefix(messages1)).toBe(hashMessagePrefix(messages2));
    });

    it("different prefix produces different hash", () => {
      const messages1 = [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
        { role: "user", content: "next" },
      ];
      const messages2 = [
        { role: "user", content: "goodbye" },
        { role: "assistant", content: "bye" },
        { role: "user", content: "next" },
      ];
      expect(hashMessagePrefix(messages1)).not.toBe(
        hashMessagePrefix(messages2),
      );
    });
  });

  describe("resolveConversationId", () => {
    it("prefers explicit header", () => {
      const result = resolveConversationId("my-convo-id", [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
        { role: "user", content: "next" },
      ]);
      expect(result).toBe("my-convo-id");
    });

    it("falls back to message hash", () => {
      const result = resolveConversationId(undefined, [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
        { role: "user", content: "next" },
      ]);
      expect(result).toBeTypeOf("string");
      expect(result!.length).toBe(16);
    });

    it("returns null for single message without header", () => {
      const result = resolveConversationId(undefined, [
        { role: "user", content: "hi" },
      ]);
      expect(result).toBeNull();
    });
  });

  describe("session CRUD", () => {
    it("set and get session", () => {
      const entry = makeEntry();
      setSession("conv-1", entry);
      expect(getSession("conv-1")).toEqual(entry);
    });

    it("returns undefined for missing session", () => {
      expect(getSession("nonexistent")).toBeUndefined();
    });

    it("updates session usage", () => {
      const entry = makeEntry({ lastUsedAt: 1000, messageCount: 2 });
      setSession("conv-1", entry);

      updateSessionUsage("conv-1", 4);

      const updated = getSession("conv-1")!;
      expect(updated.messageCount).toBe(4);
      expect(updated.lastUsedAt).toBeGreaterThan(1000);
    });

    it("updateSessionUsage is no-op for missing session", () => {
      // Should not throw
      updateSessionUsage("nonexistent", 5);
    });

    it("deletes session", () => {
      setSession("conv-1", makeEntry());
      expect(deleteSession("conv-1")).toBe(true);
      expect(getSession("conv-1")).toBeUndefined();
    });

    it("returns false when deleting nonexistent", () => {
      expect(deleteSession("nonexistent")).toBe(false);
    });

    it("tracks session count", () => {
      expect(getSessionCount()).toBe(0);
      setSession("a", makeEntry());
      setSession("b", makeEntry());
      expect(getSessionCount()).toBe(2);
      deleteSession("a");
      expect(getSessionCount()).toBe(1);
    });
  });

  describe("cleanup", () => {
    it("removes expired sessions", () => {
      const old = makeEntry({
        lastUsedAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
      });
      const recent = makeEntry({ lastUsedAt: Date.now() });

      setSession("old", old);
      setSession("recent", recent);

      const removed = cleanupExpiredSessions();
      expect(removed).toBe(1);
      expect(getSession("old")).toBeUndefined();
      expect(getSession("recent")).toBeDefined();
    });

    it("returns 0 when nothing to clean", () => {
      setSession("fresh", makeEntry());
      expect(cleanupExpiredSessions()).toBe(0);
    });
  });

  describe("cleanup interval", () => {
    it("starts and stops without error", () => {
      startCleanupInterval(100_000);
      stopCleanupInterval();
    });

    it("does not start duplicate intervals", () => {
      startCleanupInterval(100_000);
      startCleanupInterval(100_000); // should be no-op
      stopCleanupInterval();
    });
  });
});
