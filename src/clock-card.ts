import { batteryIcon } from "@joeladam518/shared-cards/format.ts";
import { lsGet, lsSet } from "@joeladam518/shared-cards/storage.ts";
import { ToastController } from "@joeladam518/shared-cards/toast.ts";
import type {
  HomeAssistant,
  LovelaceCardConfig,
  LovelaceGridOptions,
} from "@joeladam518/shared-cards/types.ts";
import { html, LitElement, noChange, nothing, type PropertyValues, unsafeCSS } from "lit";
import { live } from "lit/directives/live.js";

import { wifiIcon } from "./format.ts";
import { type MqttMessage, publish, subscribeTopic, type Unsubscribe } from "./mqtt.ts";
import { buildNotify, loadRecent, type RecentMessage, saveRecent } from "./notify.ts";
import { renderDisplayPanel } from "./panels/display.ts";
import { renderIndicatorsPanel } from "./panels/indicators.ts";
import { renderMessagePanel } from "./panels/message.ts";
import { renderSoundPanel } from "./panels/sound.ts";
import { drawScreen, type ScreenFrame } from "./screen.ts";

import commonCss from "./common.css?inline";
import switchCss from "@joeladam518/shared-cards/switch.css?inline";
import toastCss from "@joeladam518/shared-cards/toast.css?inline";

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

export type Tab = "message" | "indicators" | "display" | "sound";

export type LastMessage = RecentMessage & { sound?: boolean };

export const storageKey = (prefix: string, what: "msg" | "recent") => `awtrix-ng-card:${prefix}:${what}`;

/**
 * Controls an AWTRIX NG pixel clock (Blueforcer firmware 1.2+) over MQTT.
 * State comes straight from the clock's MQTT topics (<prefix>/state/...); commands go out with
 * mqtt.publish to <prefix>/cmd/... . Live state needs an admin user, because Home Assistant only
 * lets admins listen to MQTT topics.
 *
 * Fields are public (with a leading underscore) so the panels in ./panels/ can read them.
 */
export class AwtrixNgCard extends LitElement {
  static override properties = {
    _config: { state: true },
    _tab: { state: true },
    _appsOpen: { state: true },
    _rainbow: { state: true },
    _drafts: { state: true },
  };

  static override styles = [unsafeCSS(switchCss), unsafeCSS(toastCss), unsafeCSS(commonCss)];

  declare _config?: AwtrixNgCardConfig & { preview: boolean; preview_interval: number };
  declare _tab: Tab;
  declare _appsOpen: boolean;
  /** Message panel: rainbow text on/off. */
  declare _rainbow: boolean;
  /** Slider values while the user is dragging them, by slider key. */
  declare _drafts: Record<string, number>;

  // Live state from MQTT. Not reactive: _onMessage asks for a render after each message.
  _dev: DeviceState | null = null;
  _set: ClockSettings | null = null;
  _caps: Capabilities | null = null;
  _audio: AudioState | null = null;
  _app = "";
  _online: boolean | null = null;
  _screen: ScreenFrame | null = null;
  _apps: string[] = [];
  _seenApps = new Set<string>();
  _subError: string | null = null;
  _recent: RecentMessage[] = [];
  /** The message form's starting values: the style used last time. */
  _last: LastMessage = { text: "" };

  _hass?: HomeAssistant;
  readonly _toast = new ToastController(this, 3200);

  private _unsubs: Unsubscribe[] = [];
  private _subscribing = false;
  private _visible = true;
  private _previewTimer?: ReturnType<typeof setTimeout>;
  private _io?: IntersectionObserver;
  private readonly _onVisibility = () => {
    if (document.visibilityState === "visible") this._schedulePreview(50);
  };

  constructor() {
    super();
    this._tab = "message";
    this._appsOpen = false;
    this._rainbow = false;
    this._drafts = {};
  }

  static getStubConfig(hass: HomeAssistant): Partial<AwtrixNgCardConfig> {
    const s = Object.values(hass?.states || {}).find(
      (e) => /mqtt_prefix/.test(e.entity_id) && e.state && !["unknown", "unavailable"].includes(e.state),
    );
    return { prefix: s ? s.state : "awtrix_clock_1" };
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("awtrix-ng-card-editor");
  }

  setConfig(config: AwtrixNgCardConfig): void {
    if (!config?.prefix) throw new Error("Set 'prefix' to the clock's MQTT prefix, e.g. awtrix_clock_1");
    const prev = this._config?.prefix;
    const prefix = String(config.prefix).replace(/\/+$/, "");
    this._config = { preview: true, preview_interval: 2000, ...config, prefix };
    if (prev !== prefix) {
      if (prev) {
        this._teardown();
        this._dev = this._set = this._caps = this._audio = this._screen = null;
        this._online = null;
        this._app = "";
        this._apps = [];
        this._seenApps = new Set();
      }
      this._last = lsGet<LastMessage>(storageKey(prefix, "msg"), { text: "" });
      this._rainbow = !!this._last.rainbow;
      this._recent = loadRecent(storageKey(prefix, "recent"));
    }
    if (this.isConnected && this._hass) void this._subscribe();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  set hass(hass: HomeAssistant) {
    const first = !this._hass;
    this._hass = hass;
    if (first) {
      this.requestUpdate();
      if (this.isConnected) void this._subscribe();
    }
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this._hass && this._config) void this._subscribe();
    if ("IntersectionObserver" in window) {
      this._io = new IntersectionObserver((entries) => {
        this._visible = entries.some((e) => e.isIntersecting);
        if (this._visible) this._schedulePreview(50);
      });
      this._io.observe(this);
    }
    document.addEventListener("visibilitychange", this._onVisibility);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._teardown();
    this._io?.disconnect();
    document.removeEventListener("visibilitychange", this._onVisibility);
  }

  getCardSize(): number {
    return 9;
  }

  getGridOptions(): LovelaceGridOptions {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }

  get _p(): string {
    return this._config!.prefix;
  }

  /* ---------------------------------------------------------------- MQTT */

  private async _subscribe(): Promise<void> {
    const h = this._hass;
    if (this._subscribing || this._unsubs.length || !h?.connection || !this._config) return;
    this._subscribing = true;
    const onMessage = (m: MqttMessage) => this._onMessage(m.topic, m.payload);
    const topics = [`${this._p}/state/#`, `${this._p}/availability`, `${this._p}/event/error`];
    const results = await Promise.allSettled(topics.map((topic) => subscribeTopic(h, topic, onMessage)));
    this._unsubs = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    const err = failed?.reason as { code?: string; message?: string } | undefined;
    this._subError = !failed
      ? null
      : err?.code === "unauthorized"
        ? "Live state needs an admin user (Home Assistant only lets admins listen to MQTT)."
        : `Could not listen to MQTT: ${err?.message || String(failed.reason)}`;
    this._subscribing = false;
    this.requestUpdate();
    this._schedulePreview(300);
  }

  private _teardown(): void {
    for (const unsub of this._unsubs) {
      try {
        unsub();
      } catch {
        // already gone
      }
    }
    this._unsubs = [];
    clearTimeout(this._previewTimer);
    this._previewTimer = undefined;
  }

  _onMessage(topic: string, payload: string): void {
    const t = topic.slice(this._p.length + 1);
    const json = <T>(): T | null => {
      try {
        return JSON.parse(payload) as T;
      } catch {
        return null;
      }
    };
    switch (t) {
      case "availability":
        this._online = payload === "online";
        break;
      case "state/device": {
        const d = json<DeviceState>();
        if (!d) return;
        this._dev = d;
        if (d.currentApp) {
          this._app = d.currentApp;
          this._seenApps.add(d.currentApp);
        }
        break;
      }
      case "state/settings": {
        const s = json<ClockSettings>();
        if (s) this._set = s;
        break;
      }
      case "state/capabilities": {
        const c = json<Capabilities>();
        if (c) this._caps = c;
        break;
      }
      case "state/audio": {
        const a = json<AudioState>();
        if (a) this._audio = a;
        break;
      }
      case "state/apps/active":
        this._app = payload;
        if (payload) this._seenApps.add(payload);
        break;
      case "state/screen": {
        const s = json<ScreenFrame>();
        if (!s) return;
        this._screen = s;
        this._draw();
        this._schedulePreview();
        return;
      }
      case "event/error": {
        const e = json<{ request?: string; error?: { message?: string } }>();
        const what = String(e?.request || "").split("/cmd/")[1] || "command";
        this._toast.show(
          e?.error?.message ? `Clock rejected ${what}: ${e.error.message}` : "The clock rejected a command",
        );
        return;
      }
      default:
        return;
    }
    this.requestUpdate();
  }

  _pub(sub: string, payload?: unknown): void {
    if (!this._hass) return;
    void publish(this._hass, this._p, sub, payload).catch((e: unknown) =>
      this._toast.show((e as Error)?.message || "Publish failed"),
    );
  }

  /** Change clock settings, showing the new values straight away. */
  _settings(patch: ClockSettings): void {
    this._set = { ...this._set, ...patch };
    this._pub("settings", patch);
    this.requestUpdate();
  }

  /* -------------------------------------------------------------- preview */

  _schedulePreview(delay?: number): void {
    clearTimeout(this._previewTimer);
    if (!this._config?.preview || !this._unsubs.length) return;
    const wait = delay ?? Math.max(500, Number(this._config.preview_interval) || 2000);
    this._previewTimer = setTimeout(() => this._requestFrame(), wait);
  }

  private _requestFrame(): void {
    const canRun =
      this.isConnected && this._visible && document.visibilityState === "visible" && this._online !== false;
    if (!canRun) return; // resumes from the IntersectionObserver / visibilitychange
    if (this._dev?.matrixPower === false) {
      this._draw();
      this._schedulePreview();
      return;
    }
    this._pub("screen/get", "");
    // If no frame comes back, try again later.
    this._previewTimer = setTimeout(() => this._schedulePreview(), 5000);
  }

  _isBig(): boolean {
    return this._caps?.platform?.id === "tc002" || this._dev?.boardType === "tc002";
  }

  private _draw(): void {
    const canvas = this.renderRoot?.querySelector<HTMLCanvasElement>("#screen");
    if (canvas)
      drawScreen(canvas, this._screen, { off: this._dev?.matrixPower === false, big: this._isBig() });
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    this._draw();
  }

  /* ------------------------------------------------------------- app list */

  private async _loadApps(): Promise<void> {
    const ip = this._dev?.ipAddress;
    if (!ip || location.protocol === "https:") return;
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 3000);
      const r = await fetch(`http://${ip}/api/v1/apps`, { signal: ctl.signal });
      clearTimeout(timer);
      if (!r.ok) return;
      const list = (await r.json()) as { name?: string; enabled?: boolean; present?: boolean }[];
      if (Array.isArray(list)) {
        this._apps = list
          .filter((a) => a?.name && a.enabled !== false && a.present !== false)
          .map((a) => a.name!);
      }
    } catch {
      // not reachable from this browser – fall back to the apps seen so far
    }
    this.requestUpdate();
  }

  _appList(): string[] {
    return [...new Set([...this._apps, ...(this._config?.apps || []), ...this._seenApps])];
  }

  _switchApp(name: string): void {
    this._pub("apps/switch", JSON.stringify({ name, fast: false }));
    this._app = name;
    this._appsOpen = false;
    this._schedulePreview(800);
  }

  /* ------------------------------------------------------------- message */

  _q<T extends Element = HTMLInputElement>(sel: string): T {
    return this.renderRoot.querySelector<T>(sel)!;
  }

  _send(): void {
    const text = this._q("#msgText").value.trim();
    const icon = this._q("#msgIcon").value.trim();
    if (!text && !icon) {
      this._toast.show("Type a message (or pick an icon) first");
      this._q("#msgText").focus();
      return;
    }
    const color = this._q("#msgColor").value.toUpperCase();
    const rainbow = this._rainbow;
    const dur = Number(this._q<HTMLSelectElement>("#msgDur").value);
    const effect = this._q<HTMLSelectElement>("#msgEffect").value;
    const sound = this._q("#msgSound").checked;

    this._pub("notify", buildNotify({ text, color, rainbow, icon, dur, effect, sound }));
    this._toast.show(dur < 0 ? "Sent — it stays until you tap Dismiss" : "Sent to the clock");
    // Remember the style for next time, not the text.
    lsSet(storageKey(this._p, "msg"), { text: "", color, icon, rainbow, sound });
    this._recent = saveRecent(storageKey(this._p, "recent"), { text, color, icon, rainbow }, 5);
    this._q("#msgText").value = "";
    this.requestUpdate();
    this._schedulePreview(600);
  }

  /** Put a recent message back in the form. */
  _useRecent(r: RecentMessage): void {
    this._q("#msgText").value = r.text;
    this._q("#msgColor").value = r.color || "#FFFFFF";
    this._q("#msgIcon").value = r.icon || "";
    this._rainbow = !!r.rainbow;
    this._q("#msgText").focus();
  }

  /* ------------------------------------------------------------- helpers */

  /**
   * A value for a `.value` binding that leaves the control alone while the user is using it
   * (and when there's no value yet), so incoming state never fights the user.
   *
   * "Using it" means focused, or a slider mid-drag (it has a draft). The draft check matters:
   * Safari and the iOS / macOS apps don't focus a slider you drag, so without it every
   * re-render would snap the slider back to the old value and the change would never be sent.
   */
  _held(key: string, value: unknown): unknown {
    const focused = this.renderRoot?.querySelector?.(":focus") as HTMLElement | null;
    if (value == null || key in this._drafts || focused?.dataset?.k === key) return noChange;
    return live(String(value));
  }

  /** @input handler for a slider: remember the dragged value so its label follows. */
  _draft(key: string) {
    return (e: Event) => {
      this._drafts = { ...this._drafts, [key]: Number((e.target as HTMLInputElement).value) };
    };
  }

  /**
   * @change handler for a slider: send the value, then drop the draft. Done here and not only
   * on blur, because blur never comes when the slider was never focused (Safari).
   */
  _commit(key: string, send: (value: number) => void) {
    return (e: Event) => {
      send(Number((e.target as HTMLInputElement).value));
      this._clearDraft(key)();
    };
  }

  _clearDraft(key: string) {
    return () => {
      if (key in this._drafts) {
        const { [key]: _gone, ...rest } = this._drafts;
        this._drafts = rest;
      }
    };
  }

  /* -------------------------------------------------------------- render */

  private _renderChips(): unknown {
    const d = this._dev || {};
    const fahrenheit = this._hass?.config?.unit_system?.temperature === "°F";
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
    if (d.humidity != null) chips.push(["mdi:water-percent", `${Math.round(d.humidity)}%`, "Humidity"]);
    if (d.lightLevel != null)
      chips.push(["mdi:white-balance-sunny", `${Math.round(d.lightLevel)}%`, "Ambient light"]);
    if (d.wifiRssi != null) chips.push([wifiIcon(d.wifiRssi), `${d.wifiRssi} dBm`, "Wi-Fi signal"]);
    return chips.map(
      ([icon, text, title]) =>
        html`<span class="chip" title=${title}><ha-icon .icon=${icon}></ha-icon>${text}</span>`,
    );
  }

  private _renderApps(): unknown {
    if (!this._appsOpen) return nothing;
    const list = this._appList();
    return html`<div class="apps">
      ${
        list.length
          ? list.map(
              (a) =>
                html`<button
                  class="chip-btn ${a === this._app ? "on" : ""}"
                  @click=${() => this._switchApp(a)}
                >
                  ${a}
                </button>`,
            )
          : html`<span class="note">No apps seen yet — use the arrows and they will show up here.</span>`
      }
    </div>`;
  }

  override render(): unknown {
    const c = this._config;
    if (!c || !this._hass) return nothing;
    const d = this._dev || {};
    const s = this._set || {};
    const caps = this._caps || {};

    const size = this._screen
      ? `${this._screen.width}×${this._screen.height}`
      : this._isBig()
        ? "52×16"
        : "32×8";
    const status = this._online === false ? "Offline" : this._online ? "Online" : "Connecting…";
    const powerOn = d.matrixPower !== false;
    const banner =
      this._subError ||
      (this._online === false
        ? "The clock is offline — it isn't connected to your MQTT broker right now."
        : null);

    const hasLdr = !!caps.sensors?.light;
    const auto = hasLdr && !!s.autoBrightness;
    const briNow = auto ? d.brightness : (s.brightness ?? d.brightness);
    const briShown = this._drafts.bri ?? briNow;

    const hasSound = s.volume != null || s.alertVolume != null;
    const tab: Tab = this._tab === "sound" && !hasSound ? "message" : this._tab;
    const tabs: [Tab, string, string][] = [
      ["message", "mdi:message-text-outline", "Message"],
      ["indicators", "mdi:dots-vertical", "Indicators"],
      ["display", "mdi:palette-outline", "Display"],
      ["sound", "mdi:volume-high", "Sound"],
    ];

    return html`
      <ha-card>
        <div class="head">
          <div class="title">
            <span class="dot ${this._online === false ? "bad" : this._online ? "ok" : ""}"></span>
            <div>
              <div class="name">${c.name || d.hostname || this._p}</div>
              <div class="sub">${[status, size, this._p].join(" · ")}</div>
            </div>
          </div>
          <button
            class="round power ${powerOn && this._online !== false ? "on" : ""}"
            aria-label="Display power"
            aria-pressed=${String(powerOn)}
            @click=${this._togglePower}
          >
            <ha-icon icon="mdi:power"></ha-icon>
          </button>
        </div>

        <div class="chips">${this._renderChips()}</div>
        <div class="banner" ?hidden=${!banner}>${banner ?? ""}</div>

        <div class="screen-wrap ${d.matrixPower === false ? "off" : ""}" title="Live view of the display">
          <canvas id="screen"></canvas>
          <div class="off-label">Display off</div>
        </div>

        <div class="nav">
          <button
            class="round"
            aria-label="Previous app"
            @click=${() => {
              this._pub("apps/previous", "");
              this._schedulePreview(700);
            }}
          >
            <ha-icon icon="mdi:chevron-left"></ha-icon>
          </button>
          <button
            class="app-pill ${this._appsOpen ? "open" : ""}"
            aria-label="Choose app"
            @click=${() => {
              this._appsOpen = !this._appsOpen;
              if (this._appsOpen) void this._loadApps();
            }}
          >
            <span>${this._app || d.currentApp || "–"}</span><ha-icon icon="mdi:menu-down"></ha-icon>
          </button>
          <button
            class="round"
            aria-label="Next app"
            @click=${() => {
              this._pub("apps/next", "");
              this._schedulePreview(700);
            }}
          >
            <ha-icon icon="mdi:chevron-right"></ha-icon>
          </button>
        </div>
        ${this._renderApps()}

        <div class="row bright">
          <ha-icon icon="mdi:brightness-6"></ha-icon>
          <input
            type="range"
            min="1"
            max="255"
            step="1"
            aria-label="Brightness"
            data-k="bri"
            class=${auto ? "auto" : ""}
            .value=${this._held("bri", briNow)}
            @input=${this._draft("bri")}
            @change=${this._commit("bri", (brightness) =>
              this._settings({ brightness, autoBrightness: false }),
            )}
            @blur=${this._clearDraft("bri")}
          />
          <span class="val">${briShown != null ? `${Math.round((briShown / 255) * 100)}%` : ""}</span>
          <button
            class="chip-btn ${auto ? "on" : ""}"
            ?hidden=${!hasLdr}
            @click=${() => {
              this._clearDraft("bri")();
              this._settings({ autoBrightness: !s.autoBrightness });
            }}
          >
            Auto
          </button>
        </div>

        <div class="tabs" role="tablist">
          ${tabs.map(
            ([id, icon, label]) =>
              html`<button
                role="tab"
                class=${tab === id ? "active" : ""}
                aria-selected=${String(tab === id)}
                ?hidden=${id === "sound" && !hasSound}
                @click=${() => (this._tab = id)}
              >
                <ha-icon .icon=${icon}></ha-icon><span>${label}</span>
              </button>`,
          )}
        </div>

        <section ?hidden=${tab !== "message"}>${renderMessagePanel(this)}</section>
        <section ?hidden=${tab !== "indicators"}>${renderIndicatorsPanel(this)}</section>
        <section ?hidden=${tab !== "display"}>${renderDisplayPanel(this)}</section>
        <section ?hidden=${tab !== "sound"}>${renderSoundPanel(this)}</section>

        ${this._toast.render()}
      </ha-card>
    `;
  }

  private _togglePower(): void {
    const on = this._dev?.matrixPower === false;
    if (this._dev) this._dev.matrixPower = on;
    this._pub("display", { power: on });
    this.requestUpdate();
  }
}
