import { useEffect, useState } from "react";

import { useHost } from "@/features/host-port/HostProvider";
import type { HostLayout, HostResult } from "@/features/host-port/host-port";

const ANNOTATION_ROW_HEIGHT = 40;

export function useAnnotatedComposerLayout(isActive: boolean) {
  const host = useHost();
  const [layout, setLayout] = useState<HostLayout | null>(null);

  useEffect(() => {
    if (!isActive) {
      setLayout(null);
      return;
    }

    function publish(result: HostResult<HostLayout>) {
      if (result.status === "unavailable") {
        setLayout(null);
        return;
      }

      const nextLayout = result.value;
      setLayout((current) => (sameLayout(current, nextLayout) ? current : nextLayout));
    }

    const releaseReservation = host.layout.reserveAnnotationRow(ANNOTATION_ROW_HEIGHT);
    const stopObserving = host.layout.subscribe(publish);

    return () => {
      stopObserving();
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
