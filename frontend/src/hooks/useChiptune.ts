/**
 * Chiptune sound synthesis via the Web Audio API.
 * All sounds are generated programmatically — no audio files required.
 */
import { useAudioStore } from "../store/audioStore";

let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function getCtx(): AudioContext {
  return getAudioContext();
}

type WaveType = OscillatorType;

function playTone(
  freq: number,
  duration: number,
  wave: WaveType = "square",
  vol = 0.18,
  startDelay = 0,
) {
  const ac = getCtx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();

  osc.type = wave;
  osc.frequency.setValueAtTime(freq, ac.currentTime + startDelay);

  gain.gain.setValueAtTime(vol, ac.currentTime + startDelay);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    ac.currentTime + startDelay + duration,
  );

  osc.connect(gain);
  gain.connect(ac.destination);

  osc.start(ac.currentTime + startDelay);
  osc.stop(ac.currentTime + startDelay + duration);
}

function sequence(
  notes: [number, number][],
  wave: WaveType = "square",
  vol = 0.15,
) {
  let t = 0;
  for (const [freq, dur] of notes) {
    if (freq > 0) playTone(freq, dur, wave, vol, t);
    t += dur;
  }
}

export function useChiptune() {
  const sfxEnabled = useAudioStore((s) => s.sfxEnabled);
  const when = (fn: () => void) => {
    if (sfxEnabled) fn();
  };

  return {
    // Stage select cursor move
    blip: () => when(() => playTone(440, 0.05, "square", 0.12)),

    // Boss intro dramatic sting
    bossIntro: () =>
      when(() =>
        sequence(
          [
            [110, 0.1],
            [0, 0.05],
            [110, 0.1],
            [0, 0.05],
            [165, 0.2],
            [0, 0.05],
            [220, 0.15],
            [262, 0.15],
            [294, 0.15],
            [330, 0.4],
          ],
          "square",
          0.2,
        ),
      ),

    // User attack (sword swing)
    attack: () =>
      when(() =>
        sequence(
          [
            [880, 0.05],
            [660, 0.05],
            [440, 0.08],
            [330, 0.1],
          ],
          "sawtooth",
          0.14,
        ),
      ),

    // Receiving damage (hurt)
    hurt: () =>
      when(() =>
        sequence(
          [
            [200, 0.06],
            [150, 0.06],
            [100, 0.1],
          ],
          "square",
          0.2,
        ),
      ),

    // Victory fanfare
    victory: () =>
      when(() =>
        sequence(
          [
            [523, 0.1],
            [523, 0.1],
            [523, 0.1],
            [415, 0.075],
            [466, 0.075],
            [523, 0.1],
            [466, 0.1],
            [523, 0.4],
          ],
          "square",
          0.18,
        ),
      ),

    // Defeat descending jingle
    defeat: () =>
      when(() =>
        sequence(
          [
            [440, 0.1],
            [415, 0.1],
            [392, 0.1],
            [370, 0.1],
            [330, 0.2],
            [262, 0.4],
          ],
          "triangle",
          0.2,
        ),
      ),

    // Summary unlock fanfare
    unlock: () =>
      when(() =>
        sequence(
          [
            [262, 0.08],
            [330, 0.08],
            [392, 0.08],
            [523, 0.08],
            [659, 0.08],
            [784, 0.08],
            [1047, 0.3],
          ],
          "square",
          0.15,
        ),
      ),

    // Typing blip (very quiet, called per character)
    typingBlip: () =>
      when(() => playTone(220 + Math.random() * 60, 0.03, "square", 0.04)),
  };
}
