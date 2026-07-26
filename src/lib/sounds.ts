/**
 * HADRAN FABRICS MALL — UI sound manager.
 * Preloads the shop's notification sounds and plays them on demand.
 *
 * Browsers block audio until the user has interacted with the page at least
 * once — so playback is unlocked on the first pointer/key interaction and
 * any sounds requested before that are silently skipped.
 */

export type SoundName = "chat-send" | "chat-receive" | "notification";

const SOUND_FILES: Record<SoundName, string> = {
  "chat-send": "/sounds/chat-send.mp3",
  "chat-receive": "/sounds/chat-receive.mp3",
  notification: "/sounds/notification.mp3",
};

const VOLUME: Record<SoundName, number> = {
  "chat-send": 0.35,
  "chat-receive": 0.5,
  notification: 0.55,
};

const MUTE_KEY = "hadran.sounds.muted";

const players = new Map<SoundName, HTMLAudioElement>();
let unlocked = false;

function getPlayer(name: SoundName): HTMLAudioElement {
  let p = players.get(name);
  if (!p) {
    p = new Audio(SOUND_FILES[name]);
    p.preload = "auto";
    p.volume = VOLUME[name];
    players.set(name, p);
  }
  return p;
}

/** Call once at app start — hooks the first user interaction to unlock audio. */
export function initSounds() {
  if (unlocked || typeof window === "undefined") return;
  const unlock = () => {
    unlocked = true;
    // Warm up each player so later plays are instant.
    for (const name of Object.keys(SOUND_FILES) as SoundName[]) {
      const p = getPlayer(name);
      p.muted = true;
      p.play()
        .then(() => {
          p.pause();
          p.currentTime = 0;
          p.muted = false;
        })
        .catch(() => {
          p.muted = false;
        });
    }
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: false });
  window.addEventListener("keydown", unlock, { once: false });
}

export function soundsMuted(): boolean {
  return typeof window !== "undefined" && localStorage.getItem(MUTE_KEY) === "1";
}

export function setSoundsMuted(muted: boolean) {
  localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
}

/** Play a sound. No-ops before the first user interaction or when muted. */
export function playSound(name: SoundName) {
  if (!unlocked || soundsMuted()) return;
  try {
    const p = getPlayer(name);
    p.currentTime = 0;
    void p.play().catch(() => undefined);
  } catch {
    /* audio is best-effort */
  }
}
