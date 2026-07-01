import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// React Testing Library doesn't auto-cleanup without globals enabled.
afterEach(() => {
  cleanup();
});

// jsdom has no Web Audio API. The chiptune hooks only construct an
// AudioContext lazily on playback, but stub it so an incidental reference in a
// rendered component never throws during a test.
if (!("AudioContext" in globalThis)) {
  class StubAudioContext {
    currentTime = 0;
    destination = {};
    createOscillator() {
      return {
        type: "square",
        frequency: { setValueAtTime() {} },
        connect() {},
        start() {},
        stop() {},
      };
    }
    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect() {},
      };
    }
  }
  // @ts-expect-error -- minimal stub for the test environment
  globalThis.AudioContext = StubAudioContext;
}
