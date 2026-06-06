/** Stub tasks API for local-only / strict typecheck builds. */
export const tasksApi = {
  list: async () => [] as { id: string; title: string }[],
  get: async (_id: string) => null as { id: string; title: string } | null,
};
