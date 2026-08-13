import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    // Reuse preloaded data for 30s instead of refetching on every hover
    defaultPreloadStaleTime: 30_000,
    defaultPreloadGcTime: 5 * 60_000,
    defaultPendingMs: 120,
    defaultPendingMinMs: 80,
  });

  if (typeof window !== "undefined") {
    (window as any).__ROUTER__ = router;
  }

  return router;
};
