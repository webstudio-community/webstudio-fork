import {
  afterEach,
  beforeEach,
  expect,
  test,
  vi,
  type MockInstance,
} from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import lottie from "lottie-web";
import { ReactSdkContext } from "@webstudio-is/react-sdk/runtime";
import { LottiePlayer } from "./lottie-player";

const createAnimation = () => {
  const listeners = new Map<string, () => void>();
  return {
    totalFrames: 10,
    destroy: vi.fn(),
    setSpeed: vi.fn(),
    setDirection: vi.fn(),
    playSegments: vi.fn(),
    goToAndStop: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    addEventListener: vi.fn((name: string, callback: () => void) => {
      listeners.set(name, callback);
    }),
    emit: (name: string) => listeners.get(name)?.(),
  };
};

type Animation = ReturnType<typeof createAnimation>;

// Browser mode does not intercept the pre-bundled dependency with vi.mock, so
// spy on the module instance the component imports dynamically.
let animation: Animation;
let loadAnimation: MockInstance<typeof lottie.loadAnimation>;

const sdkContext = {
  assetBaseUrl: "/assets/",
  imageLoader: ({ src }: { src: string }) => src,
  videoLoader: ({ src }: { src: string }) => src,
  resources: {},
  breakpoints: [],
  onError: vi.fn(),
  renderer: "preview" as const,
};

const renderPlayer = async (props: ComponentProps<typeof LottiePlayer>) => {
  const result = render(
    <ReactSdkContext.Provider value={sdkContext}>
      <LottiePlayer data-testid="player" src="/animation.json" {...props} />
    </ReactSdkContext.Provider>
  );
  await waitFor(() => expect(loadAnimation).toHaveBeenCalled());
  animation.emit("data_ready");
  return result.getByTestId("player");
};

beforeEach(() => {
  animation = createAnimation();
  loadAnimation = vi
    .spyOn(lottie, "loadAnimation")
    .mockReturnValue(
      animation as unknown as ReturnType<typeof lottie.loadAnimation>
    );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("loop plays automatically", async () => {
  await renderPlayer({ behavior: "loop" });
  expect(loadAnimation).toHaveBeenCalledWith(
    expect.objectContaining({ loop: true, autoplay: true })
  );
});

test("loop on click starts looping on click and pauses on the next click", async () => {
  const player = await renderPlayer({ behavior: "loop on click" });
  expect(loadAnimation).toHaveBeenCalledWith(
    expect.objectContaining({ loop: true, autoplay: false })
  );
  expect(animation.play).not.toHaveBeenCalled();

  fireEvent.click(player);
  expect(animation.play).toHaveBeenCalledTimes(1);
  expect(animation.pause).not.toHaveBeenCalled();

  fireEvent.click(player);
  expect(animation.pause).toHaveBeenCalledTimes(1);

  fireEvent.click(player);
  expect(animation.play).toHaveBeenCalledTimes(2);
  expect(animation.playSegments).not.toHaveBeenCalled();
});

test("loop on hover loops while hovered and pauses on mouse out", async () => {
  const player = await renderPlayer({ behavior: "loop on hover" });
  expect(loadAnimation).toHaveBeenCalledWith(
    expect.objectContaining({ loop: true, autoplay: false })
  );

  fireEvent.mouseEnter(player);
  expect(animation.play).toHaveBeenCalledTimes(1);

  fireEvent.mouseLeave(player);
  expect(animation.pause).toHaveBeenCalledTimes(1);
  expect(animation.playSegments).not.toHaveBeenCalled();
});

test("loop on click starts playing when controlled as open", async () => {
  await renderPlayer({ behavior: "loop on click", isOpen: true });
  expect(animation.play).toHaveBeenCalled();
});

test("toggle on click still plays the animation forward then backward", async () => {
  const player = await renderPlayer({ behavior: "toggle on click" });
  expect(loadAnimation).toHaveBeenCalledWith(
    expect.objectContaining({ loop: false, autoplay: false })
  );

  fireEvent.click(player);
  expect(animation.playSegments).toHaveBeenLastCalledWith([0, 9], true);

  fireEvent.click(player);
  expect(animation.playSegments).toHaveBeenLastCalledWith([9, 0], true);
  expect(animation.play).not.toHaveBeenCalled();
});
