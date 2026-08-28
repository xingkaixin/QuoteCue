import { useEffect, useState } from "react";

import { useHost } from "@/features/host-port/HostProvider";
import type { HostLayout } from "@/features/host-port/host-port";

const ANNOTATION_ROW_HEIGHT = 40;
const POSITION_REFRESH_MS = 80;

export function useAnnotatedComposerLayout(isActive: boolean) {
  const host = useHost();
  const [layout, setLayout] = useState<HostLayout | null>(null);

  useEffect(() => {
    if (!isActive) {
      setLayout(null);
      return;
    }

    let refreshTimer: number | undefined;
    let lastRefreshAt = Number.NEGATIVE_INFINITY;

    function refresh() {
      refreshTimer = undefined;
      lastRefreshAt = Date.now();
      const result = host.layout.current();
      if (result.status === "unavailable") {
        setLayout(null);
        return;
      }

      const nextLayout = result.value;
      setLayout((current) => (sameLayout(current, nextLayout) ? current : nextLayout));
    }

    function scheduleRefresh() {
      if (refreshTimer !== undefined) {
        return;
      }
      const delay = POSITION_REFRESH_MS - (Date.now() - lastRefreshAt);
      if (delay <= 0) {
        refresh();
        return;
      }
      refreshTimer = window.setTimeout(refresh, delay);
    }

    const stopObserving = host.layout.subscribe(scheduleRefresh);
    refresh();
    const releaseReservation = host.layout.reserveAnnotationRow(ANNOTATION_ROW_HEIGHT);

    return () => {
      stopObserving();
      window.clearTimeout(refreshTimer);
      releaseReservation();
    };
  }, [host, isActive]);

  return layout;
}

function sameLayout(current: HostLayout | null, next: HostLayout) {
  return (
    current?.isSendControlPresent === next.isSendControlPresent &&
    current.summary.left === next.summary.left &&
    current.summary.top === next.summary.top &&
    current.send.left === next.send.left &&
    current.send.top === next.send.top &&
    current.send.width === next.send.width &&
    current.send.height === next.send.height
  );
}
