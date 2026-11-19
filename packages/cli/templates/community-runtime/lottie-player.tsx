import {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ElementRef,
  type ComponentProps,
} from "react";
import { mergeRefs } from "@react-aria/utils";
import { ReactSdkContext } from "@webstudio-is/react-sdk/runtime";

const defaultTag = "div";

type AnimationInstance = {
  destroy: () => void;
  setSpeed: (speed: number) => void;
  setDirection: (direction: 1 | -1) => void;
  playSegments: (segments: [number, number], force?: boolean) => void;
  goToAndStop: (value: number, isFrame?: boolean) => void;
  play: () => void;
  pause: () => void;
  totalFrames: number;
  addEventListener: (name: string, callback: () => void) => void;
};

type Props = ComponentProps<typeof defaultTag> & {
  /**
   * URL to the Lottie animation JSON file.
   * Accepts any public URL, including Webstudio asset URLs.
   */
  src?: string;

  /**
   * Playback speed multiplier. 1 is normal speed, 2 is double speed.
   * @default 1
   */
  speed?: number;

  /**
   * Play the animation in reverse. Only applies to loop behaviors.
   * @default false
   */
  playReverse?: boolean;

  /**
   * Allow the animation to play directly on the canvas in the builder.
   * @default false
   */
  previewOnCanvas?: boolean;

  /**
   * How the animation behaves:
   * - "loop": plays and loops continuously.
   * - "toggle on click": click to toggle between open and closed.
   * - "toggle on hover": plays forward on hover, reverses on mouse out.
   * - "loop on click": click to start looping, click again to pause.
   * - "loop on hover": loops while hovered, pauses on mouse out.
   * @default "loop"
   */
  behavior?:
    | "loop"
    | "toggle on click"
    | "toggle on hover"
    | "loop on click"
    | "loop on hover";

  /**
   * Controlled state for click and hover behaviors: open/closed for toggle
   * behaviors, playing/paused for "loop on click" and "loop on hover".
   * When defined, overrides the internal state. Bind to a variable
   * when the animation state needs to be shared with other elements.
   */
  isOpen?: boolean;

  // lottie fills the container — children are not supported
  children?: never;
};

type Ref = ElementRef<typeof defaultTag>;

export const LottiePlayer = forwardRef<Ref, Props>(
  (
    {
      src,
      speed = 1,
      playReverse = false,
      previewOnCanvas = false,
      behavior = "loop",
      isOpen,
      children: _children,
      ...rest
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const animRef = useRef<AnimationInstance | null>(null);
    const totalFramesRef = useRef(0);
    // Tracks open state directly without React re-renders
    const openStateRef = useRef(isOpen ?? false);

    // Loop behaviors play the whole animation repeatedly; toggle behaviors
    // play it once forward (open) or backward (closed).
    const isLoopMode =
      behavior === "loop" ||
      behavior === "loop on click" ||
      behavior === "loop on hover";
    const isClickMode =
      behavior === "toggle on click" || behavior === "loop on click";
    const isHoverMode =
      behavior === "toggle on hover" || behavior === "loop on hover";
    const isControlledMode = isClickMode || isHoverMode;

    const { renderer } = useContext(ReactSdkContext);

    const playSegment = useCallback((open: boolean) => {
      const anim = animRef.current;
      const total = totalFramesRef.current;
      if (!anim || total <= 0) {
        return;
      }
      const lastFrame = total - 1;
      anim.playSegments(open ? [0, lastFrame] : [lastFrame, 0], true);
    }, []);

    // Applies the open (toggle) / playing (loop) state of click and hover
    // behaviors.
    const setActive = useCallback(
      (active: boolean) => {
        if (isLoopMode === false) {
          playSegment(active);
          return;
        }
        const anim = animRef.current;
        if (!anim) {
          return;
        }
        if (active) {
          anim.play();
        } else {
          anim.pause();
        }
      },
      [isLoopMode, playSegment]
    );

    // Create / destroy the animation when source or display settings change
    useEffect(() => {
      const container = containerRef.current;

      if (!container || !src || (renderer === "canvas" && !previewOnCanvas)) {
        return;
      }

      let cancelled = false;

      import("lottie-web").then(({ default: lottie }) => {
        if (cancelled || !container.isConnected) {
          return;
        }

        const anim = lottie.loadAnimation({
          container,
          renderer: "svg",
          loop: isLoopMode,
          autoplay: isLoopMode && isControlledMode === false,
          path: src,
        }) as AnimationInstance;

        animRef.current = anim;
        anim.setSpeed(speed);
        anim.setDirection(playReverse ? -1 : 1);

        anim.addEventListener("data_ready", () => {
          if (cancelled) {
            return;
          }
          totalFramesRef.current = anim.totalFrames;
          if (isControlledMode === false) {
            return;
          }
          if (isLoopMode) {
            if (openStateRef.current) {
              anim.play();
            }
            return;
          }
          const lastFrame = anim.totalFrames - 1;
          anim.goToAndStop(openStateRef.current ? lastFrame : 0, true);
        });
      });

      return () => {
        cancelled = true;
        animRef.current?.destroy();
        animRef.current = null;
        totalFramesRef.current = 0;
      };
    }, [
      src,
      speed,
      playReverse,
      renderer,
      previewOnCanvas,
      behavior,
      isLoopMode,
      isControlledMode,
    ]);

    // Handle external isOpen prop changes (controlled mode)
    useEffect(() => {
      if (!isControlledMode || isOpen === undefined) {
        return;
      }
      openStateRef.current = isOpen;
      setActive(isOpen);
    }, [isOpen, isControlledMode, setActive]);

    if (!src) {
      return (
        <div
          {...rest}
          ref={ref}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            fontSize: "0.875rem",
            ...rest.style,
          }}
        >
          Open the &quot;Settings&quot; panel and paste a Lottie animation URL
        </div>
      );
    }

    if (renderer === "canvas" && !previewOnCanvas) {
      return (
        <div
          {...rest}
          ref={ref}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            padding: 20,
            textAlign: "center",
            fontSize: "0.75rem",
            ...rest.style,
          }}
        >
          <span>Lottie Animation</span>
          <span style={{ opacity: 0.5, wordBreak: "break-all" }}>{src}</span>
        </div>
      );
    }

    const handleClick =
      isClickMode && isOpen === undefined
        ? () => {
            const newOpen = !openStateRef.current;
            openStateRef.current = newOpen;
            setActive(newOpen);
          }
        : rest.onClick;

    const handleMouseEnter = isHoverMode
      ? () => {
          openStateRef.current = true;
          setActive(true);
        }
      : rest.onMouseEnter;

    const handleMouseLeave = isHoverMode
      ? () => {
          openStateRef.current = false;
          setActive(false);
        }
      : rest.onMouseLeave;

    return (
      <div
        {...rest}
        ref={mergeRefs(ref, containerRef)}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={
          isControlledMode ? { cursor: "pointer", ...rest.style } : rest.style
        }
      />
    );
  }
);

LottiePlayer.displayName = "LottiePlayer";
