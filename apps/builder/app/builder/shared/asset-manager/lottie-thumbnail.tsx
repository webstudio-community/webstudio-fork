import { useEffect, useRef, useState } from "react";
import { Box } from "@webstudio-is/design-system";
import { GenericFilePreview } from "./asset-thumbnail";

type Props = {
  src: string;
  ext: string;
  format: string;
};

/** Minimal shape check so non-animation JSON files keep the generic preview. */
const isLottieAnimationData = (data: unknown): data is object => {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const { fr, ip, op, layers } = data as Record<string, unknown>;
  return (
    typeof fr === "number" &&
    typeof ip === "number" &&
    typeof op === "number" &&
    Array.isArray(layers)
  );
};

export const LottieThumbnail = ({ src, ext, format }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let cancelled = false;
    let destroy: (() => void) | undefined;
    const controller = new AbortController();

    const load = async () => {
      // Fetch the JSON ourselves instead of lottie's `path` option: lottie's
      // XHR loader throws an uncaught error when a URL answers 200 with a
      // non-JSON body (e.g. an HTML page).
      const response = await fetch(src, { signal: controller.signal });
      if (response.ok === false) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const animationData: unknown = await response.json();
      if (isLottieAnimationData(animationData) === false) {
        throw new Error("Not a Lottie animation");
      }
      const { default: lottie } = await import("lottie-web");
      if (cancelled || !container.isConnected) {
        return;
      }
      // autoplay: false renders the first frame and stops there.
      const anim = lottie.loadAnimation({
        container,
        renderer: "svg",
        loop: false,
        autoplay: false,
        animationData,
      });
      destroy = () => anim.destroy();
    };

    load().catch(() => {
      if (cancelled === false) {
        setHasError(true);
      }
    });

    return () => {
      cancelled = true;
      controller.abort();
      destroy?.();
      container.innerHTML = "";
    };
  }, [src]);

  if (hasError) {
    return <GenericFilePreview ext={ext} format={format} />;
  }

  return (
    <Box
      ref={containerRef}
      css={{
        position: "absolute",
        width: "100%",
        height: "100%",
        "& svg": {
          width: "100% !important",
          height: "100% !important",
        },
      }}
    />
  );
};
