import {
  awtrixCss,
  batteryIcon,
  type CardProps,
  createCardElement,
  type HomeAssistant,
  type LovelaceCardConfig,
  switchCss,
  toastCss,
  useToast,
} from "homeassistant-ui-shared";
import type { FunctionComponent as FC } from "preact";
import { useRef, useState } from "preact/hooks";

import { wifiIcon } from "./format.ts";
import { DisplayPanel } from "./panels/display.tsx";
import { IndicatorsPanel } from "./panels/indicators.tsx";
import { MessagePanel } from "./panels/message.tsx";
import { SoundPanel } from "./panels/sound.tsx";
import { type DeviceState, useClock } from "./use-clock.ts";
import { useSliders } from "./use-sliders.ts";

export interface AwtrixNgCardConfig extends LovelaceCardConfig {
  /** The clock's MQTT prefix (required), e.g. awtrix_clock_1. */
  prefix: string;
  name?: string;
  /** Live mirror of the display (default true). */
  preview?: boolean;
  /** Milliseconds between preview frames (default 2000, min 500). */
  preview_interval?: number;
  /** Extra entries for the "jump to app" picker. */
  apps?: string[];
}

type Config = AwtrixNgCardConfig & { preview: boolean; preview_interval: number };

export type Tab = "message" | "indicators" | "display" | "sound";

const TABS: [Tab, string, string][] = [
  ["message", "mdi:message-text-outline", "Message"],
  ["indicators", "mdi:dots-vertical", "Indicators"],
  ["display", "mdi:palette-outline", "Display"],
  ["sound", "mdi:volume-high", "Sound"],
];

/** The clock's sensors as [icon, text, title] chips. */
function chipsFor(d: DeviceState, hass: HomeAssistant): [string, string, string][] {
  const fahrenheit = hass.config?.unit_system?.temperature === "°F";
  const chips: [string, string, string][] = [];
  if (d.batteryPercent != null) {
    chips.push([
      batteryIcon(d.batteryPercent, { charging: d.usbPower }),
      `${d.batteryPercent}%`,
      d.usbPower ? "Charging" : "Battery",
    ]);
  }
  if (d.temperature != null) {
    chips.push([
      "mdi:thermometer",
      fahrenheit ? `${Math.round(d.temperature * 1.8 + 32)}°F` : `${Number(d.temperature).toFixed(1)}°C`,
      "Temperature",
    ]);
  }
  if (d.humidity != null) {
    chips.push(["mdi:water-percent", `${Math.round(d.humidity)}%`, "Humidity"]);
  }
  if (d.lightLevel != null) {
    chips.push(["mdi:white-balance-sunny", `${Math.round(d.lightLevel)}%`, "Ambient light"]);
  }
  if (d.wifiRssi != null) {
    chips.push([wifiIcon(d.wifiRssi), `${d.wifiRssi} dBm`, "Wi-Fi signal"]);
  }
  return chips;
}

/** The clock's enabled apps from its web API, when this browser can reach it. */
async function fetchApps(ip: string | undefined): Promise<string[] | null> {
  if (!ip || location.protocol === "https:") {
    return null;
  }
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 3000);
    const r = await fetch(`http://${ip}/api/v1/apps`, { signal: ctl.signal });
    clearTimeout(timer);
    if (!r.ok) {
      return null;
    }
    const list = (await r.json()) as { name?: string; enabled?: boolean; present?: boolean }[];
    return Array.isArray(list)
      ? list.filter((a) => a?.name && a.enabled !== false && a.present !== false).map((a) => a.name!)
      : null;
  } catch {
    // not reachable from this browser – fall back to the apps seen so far
    return null;
  }
}

/**
 * Controls an AWTRIX NG pixel clock (Blueforcer firmware 1.2+) over MQTT: live display preview,
 * apps, brightness, messages, indicators, display settings and sound.
 */
export const AwtrixNgCard: FC<CardProps<Config>> = ({ config: c, hass, host }) => {
  const [tab, setTab] = useState<Tab>("message");
  const [appsOpen, setAppsOpen] = useState(false);
  const [apps, setApps] = useState<string[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { show: showToast, toast } = useToast(3200);
  const sliders = useSliders(host.shadowRoot);
  const clock = useClock({
    prefix: c.prefix,
    hass,
    preview: c.preview,
    previewInterval: c.preview_interval,
    host,
    canvas,
    toast: showToast,
  });

  const { live } = clock;
  const d = live.dev || {};
  const s = live.set || {};
  const caps = live.caps || {};

  const size = live.screen ? `${live.screen.width}×${live.screen.height}` : clock.big ? "52×16" : "32×8";
  const status = live.online === false ? "Offline" : live.online ? "Online" : "Connecting…";
  const powerOn = d.matrixPower !== false;
  const banner =
    live.subError ||
    (live.online === false
      ? "The clock is offline — it isn't connected to your MQTT broker right now."
      : null);

  const hasLdr = !!caps.sensors?.light;
  const auto = hasLdr && !!s.autoBrightness;
  const briNow = auto ? d.brightness : (s.brightness ?? d.brightness);
  const briShown = sliders.drafts.bri ?? briNow;

  const hasSound = s.volume != null || s.alertVolume != null;
  const shownTab: Tab = tab === "sound" && !hasSound ? "message" : tab;
  const appList = [...new Set([...apps, ...(c.apps || []), ...live.seenApps])];

  const togglePower = (): void => {
    const on = live.dev?.matrixPower === false;
    if (live.dev) {
      clock.setDevice({ ...live.dev, matrixPower: on });
    }
    clock.pub("display", { power: on });
  };

  const switchApp = (name: string): void => {
    clock.pub("apps/switch", JSON.stringify({ name, fast: false }));
    clock.setApp(name);
    setAppsOpen(false);
    clock.schedulePreview(800);
  };

  const toggleApps = (): void => {
    setAppsOpen(!appsOpen);
    if (!appsOpen) {
      void fetchApps(live.dev?.ipAddress).then((list) => {
        if (list) {
          setApps(list);
        }
      });
    }
  };

  const step = (sub: "apps/previous" | "apps/next"): void => {
    clock.pub(sub, "");
    clock.schedulePreview(700);
  };

  return (
    <ha-card>
      <div class="head">
        <div class="title">
          <span class={`dot ${live.online === false ? "bad" : live.online ? "ok" : ""}`} />
          <div>
            <div class="name">{c.name || d.hostname || c.prefix}</div>
            <div class="sub">{[status, size, c.prefix].join(" · ")}</div>
          </div>
        </div>
        <button
          class={`round power ${powerOn && live.online !== false ? "on" : ""}`}
          aria-label="Display power"
          aria-pressed={powerOn}
          onClick={togglePower}
        >
          <ha-icon icon="mdi:power" />
        </button>
      </div>

      <div class="chips">
        {chipsFor(d, hass).map(([icon, text, title]) => (
          <span key={title} class="chip" title={title}>
            <ha-icon icon={icon} />
            {text}
          </span>
        ))}
      </div>
      <div class="banner" hidden={!banner}>
        {banner ?? ""}
      </div>

      <div class={`screen-wrap ${d.matrixPower === false ? "off" : ""}`} title="Live view of the display">
        <canvas ref={canvas} id="screen" />
        <div class="off-label">Display off</div>
      </div>

      <div class="nav">
        <button class="round" aria-label="Previous app" onClick={() => step("apps/previous")}>
          <ha-icon icon="mdi:chevron-left" />
        </button>
        <button class={`app-pill ${appsOpen ? "open" : ""}`} aria-label="Choose app" onClick={toggleApps}>
          <span>{live.app || d.currentApp || "–"}</span>
          <ha-icon icon="mdi:menu-down" />
        </button>
        <button class="round" aria-label="Next app" onClick={() => step("apps/next")}>
          <ha-icon icon="mdi:chevron-right" />
        </button>
      </div>
      {appsOpen && (
        <div class="apps">
          {appList.length ? (
            appList.map((a) => (
              <button key={a} class={`chip-btn ${a === live.app ? "on" : ""}`} onClick={() => switchApp(a)}>
                {a}
              </button>
            ))
          ) : (
            <span class="note">No apps seen yet — use the arrows and they will show up here.</span>
          )}
        </div>
      )}

      <div class="row bright">
        <ha-icon icon="mdi:brightness-6" />
        <input
          type="range"
          min={1}
          max={255}
          step={1}
          aria-label="Brightness"
          data-k="bri"
          class={auto ? "auto" : ""}
          value={sliders.held("bri", briNow)}
          onInput={sliders.onInput("bri")}
          onChange={sliders.onChange("bri", (brightness) =>
            clock.settings({ brightness, autoBrightness: false }),
          )}
          onBlur={sliders.clear("bri")}
        />
        <span class="val">{briShown != null ? `${Math.round((briShown / 255) * 100)}%` : ""}</span>
        <button
          class={`chip-btn ${auto ? "on" : ""}`}
          hidden={!hasLdr}
          onClick={() => {
            sliders.clear("bri")();
            clock.settings({ autoBrightness: !s.autoBrightness });
          }}
        >
          Auto
        </button>
      </div>

      <div class="tabs" role="tablist">
        {TABS.map(([id, icon, label]) => (
          <button
            key={id}
            role="tab"
            class={shownTab === id ? "active" : ""}
            aria-selected={shownTab === id}
            hidden={id === "sound" && !hasSound}
            onClick={() => setTab(id)}
          >
            <ha-icon icon={icon} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <section hidden={shownTab !== "message"}>
        <MessagePanel key={c.prefix} clock={clock} />
      </section>
      <section hidden={shownTab !== "indicators"}>
        <IndicatorsPanel clock={clock} sliders={sliders} />
      </section>
      <section hidden={shownTab !== "display"}>
        <DisplayPanel clock={clock} sliders={sliders} />
      </section>
      <section hidden={shownTab !== "sound"}>
        <SoundPanel clock={clock} sliders={sliders} />
      </section>

      {toast}
    </ha-card>
  );
};

export const AwtrixNgCardElement = createCardElement(AwtrixNgCard, {
  styles: [switchCss, toastCss, awtrixCss],
  config: (config: AwtrixNgCardConfig): Config => {
    if (!config?.prefix) {
      throw new Error("Set 'prefix' to the clock's MQTT prefix, e.g. awtrix_clock_1");
    }
    const prefix = String(config.prefix).replace(/\/+$/, "");
    return { preview: true, preview_interval: 2000, ...config, prefix };
  },
  // Everything comes over MQTT: only the first `hass` renders. Commands use `hass.callService`
  // and `hass.connection`, which stay the same.
  watch: () => [],
  cardSize: 9,
  gridOptions: { columns: 12, min_columns: 6, rows: "auto" },
  editor: "awtrix-ng-card-editor",
  stubConfig: (hass) => {
    const s = Object.values(hass?.states || {}).find(
      (e) => /mqtt_prefix/.test(e.entity_id) && e.state && !["unknown", "unavailable"].includes(e.state),
    );
    return { prefix: s ? s.state : "awtrix_clock_1" };
  },
});

export type AwtrixNgCardElement = InstanceType<typeof AwtrixNgCardElement>;
