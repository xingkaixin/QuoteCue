import { useEffect, useState } from "react";

export type VisualViewportBounds = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export function useVisualViewportBounds() {
  const [bounds, setBounds] = useState(currentVisualViewportBounds);

  useEffect(() => {
    const updateBounds = () => {
      const nextBounds = currentVisualViewportBounds();
      setBounds((current) => (sameBounds(current, nextBounds) ? current : nextBounds));
    };

    window.addEventListener("resize", updateBounds);
    window.visualViewport?.addEventListener("resize", updateBounds);
    window.visualViewport?.addEventListener("scroll", updateBounds);
    return () => {
      window.removeEventListener("resize", updateBounds);
      window.visualViewport?.removeEventListener("resize", updateBounds);
      window.visualViewport?.removeEventListener("scroll", updateBounds);
    };
  }, []);

  return bounds;
}

export function currentVisualViewportBounds(): VisualViewportBounds {
  const viewport = window.visualViewport;
  return viewport
    ? {
        height: viewport.height,
        left: viewport.offsetLeft,
        top: viewport.offsetTop,
        width: viewport.width,
      }
    : { height: window.innerHeight, left: 0, top: 0, width: window.innerWidth };
}

function sameBounds(left: VisualViewportBounds, right: VisualViewportBounds) {
  return (
    left.height === right.height &&
    left.left === right.left &&
    left.top === right.top &&
    left.width === right.width
  );
}
