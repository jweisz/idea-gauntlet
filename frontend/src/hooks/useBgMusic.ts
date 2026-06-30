/**
 * Looping chiptune background music via Web Audio API.
 * Procedurally generated — no audio files required.
 * Two interleaved voices scheduled with a recursive setTimeout sequencer.
 *
 * Loop fix: each effect invocation owns a closure-local `active` flag and
 * per-voice `idx`. Shared refs caused StrictMode's double-fire to spawn two
 * racing sequencers that corrupted the note index and broke looping.
 */
import { useEffect, useRef } from "react";
import { getAudioContext } from "./useChiptune";

type Note = [number, number]; // [hz (0 = rest), duration_ms]

export type Track = {
  id: string;
  name: string;
  melody: Note[];
  bass: Note[];
  melodyWave: OscillatorType;
  bassWave: OscillatorType;
  melodyVol: number;
  bassVol: number;
};

// ── Note helpers ────────────────────────────────────────────────────────────
function b(bpm: number) {
  const Q = Math.round((60 / bpm) * 1000);
  return { Q, E: Math.round(Q / 2), S: Math.round(Q / 4), H: Q * 2, DQ: Math.round(Q * 1.5) };
}

// ── Track 1: ARENA ──────────────────────────────────────────────────────────
// Upbeat A minor pentatonic, 155 BPM
const A = b(155);
const ARENA_MELODY: Note[] = [
  [659,A.S],[784,A.S],[880,A.E],[784,A.S],[659,A.S],[0,A.S],[659,A.S],[587,A.E],[523,A.E],[440,A.E],[0,A.S],[523,A.S],[587,A.E],[659,A.DQ],[0,A.E],
  [523,A.S],[587,A.S],[659,A.E],[587,A.S],[523,A.S],[0,A.S],[523,A.S],[440,A.E],[392,A.E],[330,A.E],[0,A.S],[392,A.S],[440,A.E],[523,A.DQ],[0,A.E],
  [440,A.S],[494,A.S],[523,A.S],[587,A.S],[659,A.S],[784,A.S],[880,A.E],[0,A.S],[784,A.S],[659,A.S],[587,A.S],[523,A.S],[494,A.E],[440,A.DQ],[0,A.E],
  [659,A.E],[0,A.S],[523,A.S],[587,A.E],[523,A.E],[440,A.E],[0,A.S],[330,A.S],[392,A.E],[440,A.E],[523,A.E],[0,A.S],[659,A.S],[784,A.E],[880,A.S],[784,A.S],[659,A.DQ],[0,A.E],
];
const ARENA_BASS: Note[] = [
  [220,A.Q],[0,A.E],[220,A.E],[0,A.Q],[165,A.E],[0,A.E],
  [175,A.Q],[0,A.E],[175,A.E],[0,A.Q],[147,A.E],[0,A.E],
  [196,A.Q],[0,A.E],[196,A.E],[0,A.Q],[220,A.E],[0,A.E],
  [175,A.Q],[0,A.E],[131,A.E],[0,A.Q],[165,A.E],[0,A.Q],
  [220,A.Q],[0,A.E],[220,A.E],[0,A.Q],[196,A.E],[0,A.E],
  [175,A.Q],[0,A.E],[175,A.E],[0,A.Q],[165,A.E],[0,A.E],
  [131,A.Q],[0,A.E],[131,A.E],[0,A.Q],[165,A.E],[0,A.E],
  [196,A.Q],[0,A.Q],[165,A.Q],[0,A.Q],
];

// ── Track 2: SHADOW ─────────────────────────────────────────────────────────
// Mysterious A natural minor, 100 BPM — moody with a real melodic line
const SH = b(100);
const SHADOW_MELODY: Note[] = [
  [440,SH.E],[523,SH.E],[659,SH.Q],[0,SH.E],[587,SH.E],
  [523,SH.E],[440,SH.E],[392,SH.Q],[0,SH.E],[440,SH.E],
  [392,SH.S],[440,SH.S],[523,SH.S],[587,SH.S],[659,SH.E],[0,SH.E],
  [659,SH.DQ],[0,SH.Q],

  [523,SH.E],[587,SH.E],[659,SH.Q],[0,SH.E],[784,SH.E],
  [659,SH.E],[587,SH.E],[523,SH.Q],[0,SH.E],[587,SH.E],
  [523,SH.S],[587,SH.S],[523,SH.S],[440,SH.S],[392,SH.E],[0,SH.E],
  [440,SH.H],[0,SH.Q],

  [330,SH.E],[392,SH.E],[440,SH.Q],[523,SH.E],[0,SH.E],
  [587,SH.E],[523,SH.E],[440,SH.Q],[392,SH.E],[330,SH.E],
  [294,SH.E],[330,SH.E],[392,SH.E],[440,SH.E],
  [220,SH.H],[0,SH.H],
];
const SHADOW_BASS: Note[] = [
  [110,SH.H],[0,SH.Q],[110,SH.Q],
  [165,SH.H],[0,SH.H],
  [110,SH.Q],[0,SH.Q],[131,SH.Q],[0,SH.Q],
  [147,SH.H],[0,SH.H],
  [110,SH.Q],[0,SH.Q],[165,SH.Q],[0,SH.Q],
  [175,SH.H],[0,SH.Q],[196,SH.Q],
  [110,SH.H],[0,SH.H],
  [110,SH.H],[0,SH.H],
];

// ── Track 3: BOSS RUSH ──────────────────────────────────────────────────────
// Fast and aggressive C minor pentatonic, 175 BPM
const BS = b(175);
const BOSS_MELODY: Note[] = [
  [523,BS.S],[622,BS.S],[698,BS.S],[784,BS.S],[932,BS.E],[0,BS.S],[784,BS.S],
  [698,BS.S],[622,BS.S],[523,BS.E],[0,BS.S],[466,BS.S],[392,BS.Q],[0,BS.E],
  [466,BS.S],[523,BS.S],[622,BS.S],[698,BS.S],[784,BS.E],[0,BS.S],[698,BS.S],
  [622,BS.S],[523,BS.S],[466,BS.E],[0,BS.S],[392,BS.S],[311,BS.Q],[0,BS.E],
  [523,BS.S],[0,BS.S],[622,BS.S],[0,BS.S],[698,BS.S],[0,BS.S],[784,BS.S],[0,BS.S],
  [932,BS.E],[784,BS.E],[698,BS.E],[0,BS.S],[622,BS.S],[523,BS.Q],[0,BS.Q],
  [466,BS.S],[392,BS.S],[311,BS.S],[262,BS.S],[311,BS.E],[392,BS.E],[466,BS.E],[0,BS.E],
  [392,BS.S],[311,BS.S],[262,BS.E],[0,BS.E],[262,BS.Q],[0,BS.Q],
];
const BOSS_BASS: Note[] = [
  [131,BS.E],[0,BS.S],[131,BS.S],[196,BS.E],[0,BS.E],
  [156,BS.E],[0,BS.S],[131,BS.S],[131,BS.E],[0,BS.E],
  [131,BS.E],[0,BS.S],[156,BS.S],[175,BS.E],[0,BS.E],
  [196,BS.E],[0,BS.S],[233,BS.S],[131,BS.E],[0,BS.E],
  [131,BS.E],[0,BS.S],[131,BS.S],[196,BS.E],[0,BS.E],
  [156,BS.E],[0,BS.S],[156,BS.S],[131,BS.E],[0,BS.E],
  [175,BS.E],[0,BS.S],[196,BS.S],[175,BS.E],[0,BS.E],
  [131,BS.Q],[0,BS.Q],
];

// ── Track 4: OVERWORLD ──────────────────────────────────────────────────────
// Cheerful G major pentatonic, 132 BPM
const O = b(132);
const OVER_MELODY: Note[] = [
  [392,O.E],[440,O.E],[494,O.Q],[587,O.E],[659,O.E],
  [784,O.DQ],[0,O.E],[659,O.E],[587,O.E],
  [494,O.Q],[440,O.E],[392,O.E],[440,O.Q],
  [392,O.H],[0,O.Q],
  [587,O.E],[659,O.E],[784,O.Q],[659,O.E],[587,O.E],
  [494,O.DQ],[0,O.E],[440,O.E],[494,O.E],
  [392,O.Q],[440,O.E],[392,O.E],[330,O.Q],
  [392,O.H],[0,O.Q],
  [392,O.S],[440,O.S],[494,O.S],[587,O.S],[659,O.E],[784,O.E],[659,O.Q],[0,O.E],
  [587,O.E],[494,O.E],[440,O.E],[392,O.E],[494,O.Q],[440,O.Q],[392,O.H],
];
const OVER_BASS: Note[] = [
  [196,O.Q],[0,O.E],[196,O.E],[294,O.Q],[0,O.Q],
  [196,O.Q],[0,O.E],[196,O.E],[247,O.Q],[0,O.Q],
  [220,O.Q],[0,O.E],[220,O.E],[294,O.Q],[0,O.Q],
  [196,O.Q],[0,O.Q],[196,O.Q],[0,O.Q],
  [147,O.Q],[0,O.E],[147,O.E],[196,O.Q],[0,O.Q],
  [131,O.Q],[0,O.E],[131,O.E],[147,O.Q],[0,O.Q],
  [165,O.Q],[0,O.E],[196,O.E],[147,O.Q],[0,O.Q],
  [196,O.Q],[0,O.Q],[196,O.Q],[0,O.Q],
];

// ── Track 5: VOLTAGE ────────────────────────────────────────────────────────
// Fast electronic D minor, 168 BPM — driving sawtooth energy
const V = b(168);
const VOLT_MELODY: Note[] = [
  [587,V.S],[698,V.S],[880,V.E],[0,V.S],[880,V.S],[784,V.S],[698,V.S],[587,V.E],[0,V.E],
  [523,V.S],[587,V.S],[698,V.S],[784,V.S],[880,V.E],[784,V.E],[0,V.E],
  [698,V.S],[0,V.S],[698,V.S],[0,V.S],[784,V.E],[0,V.S],[784,V.S],
  [880,V.S],[0,V.S],[784,V.S],[698,V.S],[587,V.Q],[0,V.E],
  [880,V.S],[784,V.S],[698,V.S],[587,V.S],[698,V.E],[0,V.S],[523,V.S],
  [466,V.E],[523,V.E],[587,V.E],[0,V.E],
  [523,V.S],[587,V.S],[698,V.S],[784,V.S],[880,V.E],[0,V.E],
  [698,V.S],[587,V.S],[523,V.E],[466,V.E],[587,V.Q],[0,V.Q],
];
const VOLT_BASS: Note[] = [
  [147,V.E],[0,V.E],[147,V.E],[0,V.E],[175,V.E],[0,V.E],[147,V.E],[0,V.E],
  [196,V.E],[0,V.E],[220,V.E],[0,V.E],[131,V.E],[0,V.E],[147,V.E],[0,V.E],
  [147,V.E],[147,V.E],[0,V.E],[147,V.E],[175,V.E],[0,V.E],[175,V.E],[0,V.E],
  [196,V.E],[0,V.E],[196,V.E],[0,V.E],[147,V.Q],[0,V.Q],
];

// ── Track 6: STARLIGHT ──────────────────────────────────────────────────────
// Wistful E major pentatonic, 108 BPM — peaceful and flowing
const ST = b(108);
const STAR_MELODY: Note[] = [
  [330,ST.E],[370,ST.E],[415,ST.Q],[494,ST.E],[554,ST.E],
  [659,ST.DQ],[0,ST.E],[554,ST.E],[494,ST.E],
  [415,ST.Q],[370,ST.E],[330,ST.E],[370,ST.Q],
  [330,ST.H],[0,ST.Q],
  [494,ST.E],[554,ST.E],[659,ST.Q],[0,ST.E],[554,ST.E],
  [494,ST.Q],[415,ST.E],[370,ST.E],[415,ST.Q],
  [330,ST.E],[370,ST.E],[415,ST.E],[494,ST.E],
  [554,ST.H],[0,ST.Q],
  [659,ST.E],[0,ST.E],[554,ST.E],[494,ST.E],
  [415,ST.Q],[370,ST.E],[330,ST.E],
  [370,ST.E],[415,ST.E],[494,ST.Q],[0,ST.Q],
  [330,ST.H],[0,ST.H],
];
const STAR_BASS: Note[] = [
  [82,ST.Q],[0,ST.E],[82,ST.E],[123,ST.Q],[0,ST.Q],
  [82,ST.Q],[0,ST.E],[82,ST.E],[138,ST.Q],[0,ST.Q],
  [110,ST.Q],[0,ST.E],[110,ST.E],[123,ST.Q],[0,ST.Q],
  [82,ST.Q],[0,ST.Q],[82,ST.Q],[0,ST.Q],
  [92,ST.Q],[0,ST.E],[92,ST.E],[138,ST.Q],[0,ST.Q],
  [110,ST.Q],[0,ST.E],[110,ST.E],[92,ST.Q],[0,ST.Q],
  [82,ST.Q],[0,ST.E],[123,ST.E],[82,ST.Q],[0,ST.Q],
  [82,ST.Q],[0,ST.Q],[82,ST.Q],[0,ST.Q],
];

// ── Track 7: THUNDER ────────────────────────────────────────────────────────
// Powerful B minor, 145 BPM — heroic and dramatic
const TH = b(145);
const THUN_MELODY: Note[] = [
  [494,TH.S],[0,TH.S],[494,TH.S],[587,TH.S],[659,TH.E],[740,TH.E],[0,TH.E],
  [740,TH.S],[659,TH.S],[587,TH.S],[494,TH.S],[587,TH.Q],[0,TH.E],
  [659,TH.S],[0,TH.S],[659,TH.S],[740,TH.S],[880,TH.E],[0,TH.S],[784,TH.S],
  [740,TH.E],[659,TH.E],[587,TH.E],[0,TH.E],[494,TH.Q],[0,TH.Q],
  [494,TH.S],[554,TH.S],[587,TH.S],[659,TH.S],[740,TH.E],[880,TH.E],[0,TH.E],
  [784,TH.S],[740,TH.S],[659,TH.S],[587,TH.S],[659,TH.DQ],[0,TH.E],
  [494,TH.E],[0,TH.S],[587,TH.S],[494,TH.E],[0,TH.E],
  [587,TH.S],[659,TH.S],[587,TH.S],[494,TH.S],[440,TH.E],[494,TH.E],[0,TH.E],
  [494,TH.Q],[0,TH.Q],
];
const THUN_BASS: Note[] = [
  [123,TH.Q],[0,TH.E],[123,TH.E],[147,TH.Q],[0,TH.Q],
  [165,TH.Q],[0,TH.E],[185,TH.E],[0,TH.Q],[165,TH.Q],
  [123,TH.Q],[0,TH.E],[123,TH.E],[220,TH.Q],[0,TH.Q],
  [196,TH.Q],[0,TH.Q],[185,TH.Q],[0,TH.Q],
  [123,TH.Q],[0,TH.E],[123,TH.E],[147,TH.Q],[0,TH.Q],
  [165,TH.Q],[0,TH.E],[185,TH.E],[0,TH.Q],[165,TH.Q],
  [123,TH.Q],[0,TH.Q],[123,TH.Q],[0,TH.Q],
  [110,TH.H],[0,TH.H],
];

// ── Track 8: MIRAGE ─────────────────────────────────────────────────────────
// Exotic E Phrygian dominant, 120 BPM — mysterious and chromatic
const MI = b(120);
const MIRA_MELODY: Note[] = [
  [330,MI.E],[349,MI.E],[415,MI.Q],[0,MI.E],[440,MI.E],
  [494,MI.DQ],[0,MI.E],[440,MI.E],[415,MI.E],
  [349,MI.Q],[330,MI.E],[0,MI.E],[415,MI.Q],
  [330,MI.H],[0,MI.Q],
  [440,MI.E],[494,MI.E],[523,MI.Q],[0,MI.E],[587,MI.E],
  [523,MI.E],[494,MI.E],[440,MI.Q],[0,MI.E],
  [415,MI.S],[440,MI.S],[415,MI.S],[349,MI.S],[330,MI.H],[0,MI.H],
  [330,MI.S],[349,MI.S],[415,MI.S],[440,MI.S],[494,MI.E],[523,MI.E],[587,MI.E],[0,MI.E],
  [523,MI.E],[494,MI.E],[440,MI.Q],[0,MI.E],[415,MI.E],
  [330,MI.H],[0,MI.H],
];
const MIRA_BASS: Note[] = [
  [82,MI.H],[0,MI.Q],[82,MI.Q],
  [87,MI.H],[0,MI.Q],[123,MI.Q],
  [82,MI.Q],[0,MI.Q],[110,MI.Q],[0,MI.Q],
  [131,MI.H],[0,MI.H],
  [82,MI.Q],[0,MI.Q],[87,MI.Q],[0,MI.Q],
  [123,MI.H],[0,MI.Q],[110,MI.Q],
  [82,MI.H],[0,MI.H],
  [82,MI.H],[0,MI.H],
];

// ── Track 9: CREDITS ────────────────────────────────────────────────────────
// Gentle C major, 95 BPM — warm and uplifting
const CR = b(95);
const CRED_MELODY: Note[] = [
  [523,CR.E],[587,CR.E],[659,CR.Q],[0,CR.E],[784,CR.E],
  [880,CR.DQ],[0,CR.E],[784,CR.E],[659,CR.E],
  [587,CR.Q],[523,CR.E],[587,CR.E],[523,CR.Q],
  [523,CR.H],[0,CR.Q],
  [659,CR.E],[698,CR.E],[784,CR.Q],[0,CR.E],[880,CR.E],
  [784,CR.DQ],[0,CR.E],[698,CR.E],[659,CR.E],
  [587,CR.Q],[523,CR.E],[494,CR.E],[523,CR.Q],
  [523,CR.H],[0,CR.Q],
  [523,CR.S],[587,CR.S],[659,CR.S],[784,CR.S],[880,CR.E],[784,CR.E],[659,CR.E],[0,CR.E],
  [587,CR.E],[523,CR.E],[494,CR.Q],[0,CR.Q],[523,CR.H],[0,CR.H],
];
const CRED_BASS: Note[] = [
  [131,CR.Q],[0,CR.E],[131,CR.E],[196,CR.Q],[0,CR.Q],
  [131,CR.Q],[0,CR.E],[131,CR.E],[165,CR.Q],[0,CR.Q],
  [175,CR.Q],[0,CR.E],[175,CR.E],[196,CR.Q],[0,CR.Q],
  [131,CR.Q],[0,CR.Q],[131,CR.Q],[0,CR.Q],
  [165,CR.Q],[0,CR.E],[165,CR.E],[220,CR.Q],[0,CR.Q],
  [175,CR.Q],[0,CR.E],[175,CR.E],[147,CR.Q],[0,CR.Q],
  [131,CR.Q],[0,CR.E],[196,CR.E],[131,CR.Q],[0,CR.Q],
  [131,CR.Q],[0,CR.Q],[131,CR.Q],[0,CR.Q],
];

// ── Track registry ──────────────────────────────────────────────────────────
export const TRACKS: Track[] = [
  { id:"arena",     name:"ARENA",     melody:ARENA_MELODY,  bass:ARENA_BASS,  melodyWave:"square",   bassWave:"triangle", melodyVol:0.10, bassVol:0.12 },
  { id:"shadow",    name:"SHADOW",    melody:SHADOW_MELODY, bass:SHADOW_BASS, melodyWave:"square",   bassWave:"triangle", melodyVol:0.09, bassVol:0.10 },
  { id:"boss-rush", name:"BOSS RUSH", melody:BOSS_MELODY,   bass:BOSS_BASS,   melodyWave:"square",   bassWave:"square",   melodyVol:0.10, bassVol:0.11 },
  { id:"overworld", name:"OVERWORLD", melody:OVER_MELODY,   bass:OVER_BASS,   melodyWave:"square",   bassWave:"triangle", melodyVol:0.10, bassVol:0.11 },
  { id:"voltage",   name:"VOLTAGE",   melody:VOLT_MELODY,   bass:VOLT_BASS,   melodyWave:"sawtooth", bassWave:"square",   melodyVol:0.07, bassVol:0.10 },
  { id:"starlight", name:"STARLIGHT", melody:STAR_MELODY,   bass:STAR_BASS,   melodyWave:"sine",     bassWave:"triangle", melodyVol:0.13, bassVol:0.10 },
  { id:"thunder",   name:"THUNDER",   melody:THUN_MELODY,   bass:THUN_BASS,   melodyWave:"square",   bassWave:"sawtooth", melodyVol:0.10, bassVol:0.11 },
  { id:"mirage",    name:"MIRAGE",    melody:MIRA_MELODY,   bass:MIRA_BASS,   melodyWave:"square",   bassWave:"triangle", melodyVol:0.09, bassVol:0.09 },
  { id:"credits",   name:"CREDITS",   melody:CRED_MELODY,   bass:CRED_BASS,   melodyWave:"sine",     bassWave:"triangle", melodyVol:0.13, bassVol:0.10 },
];

// ── Sequencer ───────────────────────────────────────────────────────────────
function playNote(hz: number, durationMs: number, wave: OscillatorType, vol: number, masterGain: GainNode) {
  if (hz <= 0) return;
  const ac = getAudioContext();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = wave;
  osc.frequency.value = hz;
  const dur = durationMs / 1000;
  gain.gain.setValueAtTime(vol, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur * 0.88);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start();
  osc.stop(ac.currentTime + dur);
}

// ── Hook ────────────────────────────────────────────────────────────────────
export function useBgMusic(enabled: boolean, trackId: string) {
  const masterRef = useRef<GainNode | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (masterRef.current) {
        const g = masterRef.current;
        const ac = getAudioContext();
        g.gain.setValueAtTime(g.gain.value, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.3);
        masterRef.current = null;
      }
      return;
    }

    const track = TRACKS.find((t) => t.id === trackId) ?? TRACKS[0];
    const ac = getAudioContext();
    const master = ac.createGain();
    master.gain.value = 0.7;
    master.connect(ac.destination);
    masterRef.current = master;

    // Closure-local flag — each effect invocation owns its own, so StrictMode's
    // double-fire can't cause two sequencers to race over shared state.
    let active = true;

    function makeSequencer(notes: Note[], wave: OscillatorType, vol: number) {
      let idx = 0;
      function tick() {
        if (!active) return;
        const [hz, ms] = notes[idx];
        playNote(hz, ms, wave, vol, master);
        idx = (idx + 1) % notes.length;
        window.setTimeout(tick, ms);
      }
      tick();
    }

    makeSequencer(track.melody, track.melodyWave, track.melodyVol);
    makeSequencer(track.bass, track.bassWave, track.bassVol);

    return () => {
      active = false;
      master.gain.setValueAtTime(master.gain.value, ac.currentTime);
      master.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.15);
      masterRef.current = null;
    };
  }, [enabled, trackId]);
}
