import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { humanizeDocId } from "@/components/nova/brand";
import { api } from "@/lib/api";

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 8000,
    retry: false,
  });
}

export function useCatalog() {
  const health = useHealth();
  return useQuery({
    queryKey: ["catalog"],
    queryFn: api.catalog,
    enabled: health.isSuccess,
    staleTime: Infinity,
  });
}

/** Maps a doc_id to its human title, using the live catalog when available. */
export function useDocTitle() {
  const { data } = useCatalog();
  return useCallback(
    (docId: string) => data?.find((d) => d.doc_id === docId)?.title ?? humanizeDocId(docId),
    [data],
  );
}
