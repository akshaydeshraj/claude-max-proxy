export function getAvailableModels() {
  return [
    {
      id: "claude-opus-4-6",
      object: "model" as const,
      created: 1700000000,
      owned_by: "anthropic",
    },
    {
      id: "claude-sonnet-4-6",
      object: "model" as const,
      created: 1700000000,
      owned_by: "anthropic",
    },
    {
      id: "claude-haiku-4-5-20251001",
      object: "model" as const,
      created: 1700000000,
      owned_by: "anthropic",
    },
  ];
}

export function mapEffort(
  reasoningEffort?: string,
): "low" | "medium" | "high" | undefined {
  if (!reasoningEffort) return undefined;
  if (reasoningEffort === "low" || reasoningEffort === "medium" || reasoningEffort === "high") {
    return reasoningEffort;
  }
  return undefined;
}
