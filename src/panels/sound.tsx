import type { FunctionComponent as FC } from "preact";
import { useRef } from "preact/hooks";

import type { ClockApi } from "../use-clock.ts";
import type { Sliders } from "../use-sliders.ts";

const VOLUMES = [
  ["volume", "Master"],
  ["alertVolume", "Alerts & chimes"],
  ["appVolume", "Apps"],
  ["radioVolume", "Radio"],
] as const;

interface Props {
  clock: ClockApi;
  sliders: Sliders;
}

/** Sound tab: volumes, test chime, stop, and on the TC002 internet radio and speech. */
export const SoundPanel: FC<Props> = ({ clock, sliders }) => {
  const stationRef = useRef<HTMLSelectElement>(null);
  const sayRef = useRef<HTMLInputElement>(null);
  const s = clock.live.set || {};
  const caps = clock.live.caps || {};
  const stations = clock.live.audio?.stations || [];
  const radio = clock.live.audio?.radio || {};
  const playing = [radio.station || radio.name, radio.title].filter(Boolean).join(" — ");

  const say = (): void => {
    const input = sayRef.current!;
    const text = input.value.trim();
    if (!text) {
      return;
    }
    clock.pub("audio/play", { speech: text });
    input.value = "";
  };

  const playStation = (): void => {
    const v = stationRef.current!.value;
    if (v !== "") {
      clock.pub("audio/play", { station: /^\d+$/.test(v) ? Number(v) : v });
    }
  };

  return (
    <>
      <div>
        {VOLUMES.filter(([key]) => s[key] != null).map(([key, label]) => {
          const shown = sliders.drafts[key] ?? (s[key] as number);
          return (
            <div key={key} class="line">
              <span>{label}</span>
              <span class="slider">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  data-k={key}
                  value={sliders.held(key, s[key])}
                  onInput={sliders.onInput(key)}
                  onChange={sliders.onChange(key, (v) => clock.settings({ [key]: v }))}
                  onBlur={sliders.clear(key)}
                />
                <span class="val">{shown}%</span>
              </span>
            </div>
          );
        })}
      </div>
      <div class="actions left">
        <button class="btn ghost" onClick={() => clock.pub("audio/play", JSON.stringify("ding"))}>
          <ha-icon icon="mdi:bell-ring-outline" />
          Test chime
        </button>
        <button class="btn ghost" onClick={() => clock.pub("audio/stop", "")}>
          <ha-icon icon="mdi:stop" />
          Stop all sound
        </button>
      </div>
      <div hidden={!(caps.audio?.radio && stations.length)}>
        <div class="subhead">Radio</div>
        <div class="line">
          <select ref={stationRef} id="station">
            {stations.map((x, i) => (
              <option key={i} value={x.name || i}>
                {x.name || x.url}
              </option>
            ))}
          </select>
          <span class="color-row">
            <button class="round small" aria-label="Play station" onClick={playStation}>
              <ha-icon icon="mdi:play" />
            </button>
            <button
              class="round small"
              aria-label="Stop radio"
              onClick={() => clock.pub("audio/stop", { group: "radio" })}
            >
              <ha-icon icon="mdi:stop" />
            </button>
          </span>
        </div>
        <div class="note">
          {radio.playing || radio.state === "playing" ? `Playing: ${playing || "radio"}` : ""}
        </div>
      </div>
      <div hidden={!caps.audio?.speech}>
        <div class="subhead">Speak</div>
        <div class="field inline">
          <input
            ref={sayRef}
            type="text"
            id="sayText"
            placeholder="Text for the clock to say out loud"
            onKeyDown={(e) => e.key === "Enter" && say()}
          />
          <button class="btn primary" onClick={say}>
            <ha-icon icon="mdi:account-voice" />
            Say
          </button>
        </div>
      </div>
    </>
  );
};
