import type { FunctionComponent as FC } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import { fmtUptime, toHex } from "../format.ts";
import type { ClockApi } from "../use-clock.ts";
import type { Sliders } from "../use-sliders.ts";

const capitalize = (s: string) => s[0]!.toUpperCase() + s.slice(1);

interface Props {
  clock: ClockApi;
  sliders: Sliders;
}

/** Display tab: app rotation, transitions, text colour, overlay, mood light, device info and reboot. */
export const DisplayPanel: FC<Props> = ({ clock, sliders }) => {
  const moodRef = useRef<HTMLInputElement>(null);
  const s = clock.live.set || {};
  const d = clock.live.dev || {};
  const caps = clock.live.caps || {};
  const appDurNow = s.appDurationMs != null ? Math.round(s.appDurationMs / 1000) : null;
  const appDur = sliders.drafts.appDur ?? appDurNow;
  const transDur = sliders.drafts.transDur ?? s.transitionDurationMs;
  const mood = (): void => clock.pub("display/moodlight", { color: moodRef.current!.value, brightness: 120 });
  const info = [
    d.version && `Firmware ${d.version}`,
    d.ipAddress && `IP ${d.ipAddress}`,
    d.uptimeSeconds != null && `Up ${fmtUptime(d.uptimeSeconds)}`,
    d.fps != null && `${d.fps} fps`,
  ].filter(Boolean);

  return (
    <>
      <div class="line">
        <span>Rotate apps automatically</span>
        <button
          class={`switch ${(s.autoTransition ?? true) ? "on" : ""}`}
          aria-label="Rotate apps automatically"
          onClick={() => clock.settings({ autoTransition: !(s.autoTransition ?? true) })}
        >
          <span />
        </button>
      </div>
      <div class="line">
        <span>Time per app</span>
        <span class="slider">
          <input
            type="range"
            min={2}
            max={60}
            step={1}
            data-k="appDur"
            value={sliders.held("appDur", appDurNow)}
            onInput={sliders.onInput("appDur")}
            onChange={sliders.onChange("appDur", (v) => clock.settings({ appDurationMs: v * 1000 }))}
            onBlur={sliders.clear("appDur")}
          />
          <span class="val">{appDur != null ? `${appDur} s` : ""}</span>
        </span>
      </div>
      <div class="line">
        <span>Transition</span>
        <select onChange={(e) => clock.settings({ transitionEffect: e.currentTarget.value })}>
          {(caps.transitions || []).map((t) => (
            <option key={t} value={t} selected={t === s.transitionEffect}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div class="line">
        <span>Transition speed</span>
        <span class="slider">
          <input
            type="range"
            min={0}
            max={3000}
            step={100}
            data-k="transDur"
            value={sliders.held("transDur", s.transitionDurationMs)}
            onInput={sliders.onInput("transDur")}
            onChange={sliders.onChange("transDur", (v) => clock.settings({ transitionDurationMs: v }))}
            onBlur={sliders.clear("transDur")}
          />
          <span class="val">{transDur != null ? `${(transDur / 1000).toFixed(1)} s` : ""}</span>
        </span>
      </div>
      <div class="line">
        <span>Default text color</span>
        <input
          type="color"
          data-k="textColor"
          value={sliders.held("textColor", s.textColor ? toHex(s.textColor).toLowerCase() : null)}
          onChange={(e) => clock.settings({ textColor: e.currentTarget.value.toUpperCase() })}
        />
      </div>
      <div class="line">
        <span>Uppercase text</span>
        <button
          class={`switch ${(s.uppercase ?? true) ? "on" : ""}`}
          aria-label="Uppercase text"
          onClick={() => clock.settings({ uppercase: !(s.uppercase ?? true) })}
        >
          <span />
        </button>
      </div>
      <div class="line" hidden={!caps.overlays?.length}>
        <span>Weather overlay</span>
        <select onChange={(e) => clock.pub("display", { overlay: e.currentTarget.value || null })}>
          <option value="">None</option>
          {(caps.overlays || []).map((o) => (
            <option key={o} value={o}>
              {capitalize(o)}
            </option>
          ))}
        </select>
      </div>
      <div class="line">
        <span>Mood light</span>
        <span class="color-row">
          <input ref={moodRef} type="color" id="moodColor" defaultValue="#FF8C32" onChange={mood} />
          <button class="chip-btn" onClick={mood}>
            On
          </button>
          <button class="chip-btn" onClick={() => clock.pub("display/moodlight", "")}>
            Off
          </button>
        </span>
      </div>
      <div class="info">{info.join(" · ")}</div>
      <div class="actions">
        <a
          class="btn ghost"
          target="_blank"
          rel="noopener"
          hidden={!d.ipAddress}
          href={d.ipAddress ? `http://${d.ipAddress}/` : "#"}
        >
          <ha-icon icon="mdi:open-in-new" />
          Clock web page
        </a>
        <RebootButton clock={clock} />
      </div>
    </>
  );
};

/** Two taps to reboot: the first arms the button for 3.5 s. */
const RebootButton: FC<{ clock: ClockApi }> = ({ clock }) => {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onClick = (): void => {
    clearTimeout(timer.current);
    if (armed) {
      setArmed(false);
      clock.pub("device/reboot", "");
      clock.toast("Rebooting the clock…");
      return;
    }
    setArmed(true);
    timer.current = setTimeout(() => setArmed(false), 3500);
  };

  return (
    <button class={`btn ghost danger ${armed ? "confirm" : ""}`} onClick={onClick}>
      <ha-icon icon="mdi:restart" />
      <span>{armed ? "Tap again to reboot" : "Reboot"}</span>
    </button>
  );
};
