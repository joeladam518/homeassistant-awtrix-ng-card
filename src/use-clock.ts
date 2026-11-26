import {
  type HomeAssistant,
  type MqttMessage,
  publish,
  subscribeTopic,
  type Unsubscribe,
} from "@joeladam518/homeassistant-ui-shared";
import { type RefObject } from "preact";
import { useEffect, useReducer, useRef } from "preact/hooks";

import { drawScreen, type ScreenFrame } from "./screen.ts";

export interface Indicator {
  on: boolean;
  color: unknown;
  blinkMs?: number;
  fadeMs?: number;
}

/** `<prefix>/state/device` */
export interface DeviceState {
  hostname?: string;
  currentApp?: string;
  matrixPower?: boolean;
  brightness?: number;
  batteryPercent?: number;
  usbPower?: boolean;
  temperature?: number;
  humidity?: number;
  lightLevel?: number;
  wifiRssi?: number;
  version?: string;
  ipAddress?: string;
  uptimeSeconds?: number;
  fps?: number;
  boardType?: string;
  indicators?: Indicator[];
}

/** `<prefix>/state/settings` */
export interface ClockSettings {
  brightness?: number;
  autoBrightness?: boolean;
  autoTransition?: boolean;
  appDurationMs?: number;
  transitionEffect?: string;
  transitionDurationMs?: number;
  textColor?: unknown;
  uppercase?: boolean;
  volume?: number;
  alertVolume?: number;
  appVolume?: number;
  radioVolume?: number;
  [key: string]: unknown;
}

/** `<prefix>/state/capabilities` */
export interface Capabilities {
  platform?: { id?: string };
  sensors?: { light?: boolean };
  transitions?: string[];
  effects?: string[];
  overlays?: string[];
  audio?: { radio?: boolean; speech?: boolean };
}

/** `<prefix>/state/audio` */
export interface AudioState {
  stations?: { name?: string; url?: string }[];
  radio?: { station?: string; name?: string; title?: string; playing?: boolean; state?: string };
}

/** What the clock has told us over MQTT. */
export interface LiveState {
  dev: DeviceState | null;
  set: ClockSettings | null;
  caps: Capabilities | null;
  audio: AudioState | null;
  app: string;
  online: boolean | null;
  screen: ScreenFrame | null;
  seenApps: string[];
  subError: string | null;
}

const EMPTY: LiveState = {
  dev: null,
  set: null,
  caps: null,
  audio: null,
  app: "",
  online: null,
  screen: null,
  seenApps: [],
  subError: null,
};

/** What the panels get to read the clock and send it commands. */
export interface ClockApi {
  prefix: string;
  live: LiveState;
  /** True on the TC002 (52×16 display). */
  big: boolean;
  pub: (sub: string, payload?: unknown) => void;
  /** Change clock settings, showing the new values straight away. */
  settings: (patch: ClockSettings) => void;
  /** Show a device change straight away, before the clock reports it. */
  setDevice: (dev: DeviceState) => void;
  setApp: (app: string) => void;
  schedulePreview: (delay?: number) => void;
  toast: (text: string) => void;
}

export interface ClockOptions {
  prefix: string;
  hass: HomeAssistant;
  preview: boolean;
  previewInterval: number;
  host: HTMLElement;
  canvas: RefObject<HTMLCanvasElement | null>;
  toast: (text: string) => void;
}

const parse = <T>(payload: string): T | null => {
  try {
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
};

/**
 * Listens to an AWTRIX NG clock over MQTT (`<prefix>/state/...`) and keeps the live display preview
 * going. Commands go out with mqtt.publish to `<prefix>/cmd/...`. Live state needs an admin user,
 * because Home Assistant only lets admins listen to MQTT topics.
 */
export function useClock(opts: ClockOptions): ClockApi {
  // Live state lives in a ref, so timers and MQTT callbacks always see the latest; `rerender`
  // shows it. Screen frames are drawn straight to the canvas without a re-render.
  const live = useRef<LiveState>(EMPTY);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const latest = useRef(opts);
  latest.current = opts;

  const previewTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const subscribed = useRef(false);
  const visible = useRef(true);

  const update = (patch: Partial<LiveState>, show = true): void => {
    live.current = { ...live.current, ...patch };
    if (show) {
      rerender(0);
    }
  };

  const isBig = (): boolean =>
    live.current.caps?.platform?.id === "tc002" || live.current.dev?.boardType === "tc002";

  const draw = (): void => {
    const canvas = latest.current.canvas.current;
    if (canvas) {
      drawScreen(canvas, live.current.screen, { off: live.current.dev?.matrixPower === false, big: isBig() });
    }
  };

  const pub = (sub: string, payload?: unknown): void => {
    const { hass, prefix, toast } = latest.current;
    void publish(hass, prefix, sub, payload).catch((e: unknown) =>
      toast((e as Error)?.message || "Publish failed"),
    );
  };

  const schedulePreview = (delay?: number): void => {
    clearTimeout(previewTimer.current);
    const { preview, previewInterval } = latest.current;
    if (!preview || !subscribed.current) {
      return;
    }
    const wait = delay ?? Math.max(500, Number(previewInterval) || 2000);
    previewTimer.current = setTimeout(requestFrame, wait);
  };

  const requestFrame = (): void => {
    const canRun = visible.current && document.visibilityState === "visible" && live.current.online !== false;
    if (!canRun) {
      // resumes from the IntersectionObserver / visibilitychange
      return;
    }
    if (live.current.dev?.matrixPower === false) {
      draw();
      schedulePreview();
      return;
    }
    pub("screen/get", "");
    // If no frame comes back, try again later.
    previewTimer.current = setTimeout(() => schedulePreview(), 5000);
  };

  /** The apps seen so far, plus `app`. */
  const seen = (app: string): string[] =>
    live.current.seenApps.includes(app) ? live.current.seenApps : [...live.current.seenApps, app];

  const onMessage = (topic: string, payload: string): void => {
    const t = topic.slice(latest.current.prefix.length + 1);

    switch (t) {
      case "availability":
        update({ online: payload === "online" });
        return;
      case "state/device": {
        const d = parse<DeviceState>(payload);
        if (d) {
          update(d.currentApp ? { dev: d, app: d.currentApp, seenApps: seen(d.currentApp) } : { dev: d });
        }
        return;
      }
      case "state/settings": {
        const s = parse<ClockSettings>(payload);
        if (s) {
          update({ set: s });
        }
        return;
      }
      case "state/capabilities": {
        const c = parse<Capabilities>(payload);
        if (c) {
          update({ caps: c });
        }
        return;
      }
      case "state/audio": {
        const a = parse<AudioState>(payload);
        if (a) {
          update({ audio: a });
        }
        return;
      }
      case "state/apps/active":
        update(payload ? { app: payload, seenApps: seen(payload) } : { app: payload });
        return;
      case "state/screen": {
        const s = parse<ScreenFrame>(payload);
        if (s) {
          update({ screen: s }, false);
          draw();
          schedulePreview();
        }
        return;
      }
      case "event/error": {
        const e = parse<{ request?: string; error?: { message?: string } }>(payload);
        const what = String(e?.request || "").split("/cmd/")[1] || "command";
        latest.current.toast(
          e?.error?.message ? `Clock rejected ${what}: ${e.error.message}` : "The clock rejected a command",
        );
        return;
      }
      default:
        return;
    }
  };

  // Subscribe to the clock's topics; a new prefix starts over.
  useEffect(() => {
    const { hass, prefix } = latest.current;
    if (!hass.connection) {
      return;
    }

    let stopped = false;
    let unsubs: Unsubscribe[] = [];
    const listener = (m: MqttMessage) => onMessage(m.topic, m.payload);
    const topics = [`${prefix}/state/#`, `${prefix}/availability`, `${prefix}/event/error`];

    void Promise.allSettled(topics.map((topic) => subscribeTopic(hass, topic, listener))).then((results) => {
      unsubs = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      if (stopped) {
        stopAll(unsubs);
        return;
      }
      const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      const err = failed?.reason as { code?: string; message?: string } | undefined;
      subscribed.current = unsubs.length > 0;
      update({
        subError: !failed
          ? null
          : err?.code === "unauthorized"
            ? "Live state needs an admin user (Home Assistant only lets admins listen to MQTT)."
            : `Could not listen to MQTT: ${err?.message || String(failed.reason)}`,
      });
      schedulePreview(300);
    });

    return () => {
      stopped = true;
      stopAll(unsubs);
      subscribed.current = false;
      clearTimeout(previewTimer.current);
      live.current = EMPTY;
    };
  }, [opts.prefix]);

  // Pause the preview while the card is off screen or the tab is hidden.
  useEffect(() => {
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") {
        schedulePreview(50);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    let io: IntersectionObserver | undefined;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver((entries) => {
        visible.current = entries.some((e) => e.isIntersecting);
        if (visible.current) {
          schedulePreview(50);
        }
      });
      io.observe(latest.current.host);
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      io?.disconnect();
    };
  }, []);

  // Redraw after every render (the canvas can be new, or the display turned off).
  useEffect(() => {
    draw();
  });

  return {
    prefix: opts.prefix,
    live: live.current,
    big: isBig(),
    pub,
    settings: (patch) => {
      update({ set: { ...live.current.set, ...patch } });
      pub("settings", patch);
    },
    setDevice: (dev) => update({ dev }),
    setApp: (app) => update({ app }),
    schedulePreview,
    toast: opts.toast,
  };
}

function stopAll(unsubs: Unsubscribe[]): void {
  for (const unsub of unsubs) {
    try {
      unsub();
    } catch {
      // already gone
    }
  }
}
