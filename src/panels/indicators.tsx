import type { FunctionComponent as FC } from "preact";
import { useRef } from "preact/hooks";

import { toHex } from "../format.ts";
import type { ClockApi } from "../use-clock.ts";
import type { Sliders } from "../use-sliders.ts";

const NAMES = ["Top", "Middle", "Bottom"];
const MODES = [
  ["solid", "Solid"],
  ["blink", "Blink"],
  ["fade", "Pulse"],
] as const;

interface Props {
  clock: ClockApi;
  sliders: Sliders;
}

/** Indicators tab: the three status dots on the right edge of the display. */
export const IndicatorsPanel: FC<Props> = ({ clock, sliders }) => (
  <>
    {[1, 2, 3].map((i) => (
      <IndicatorRow key={i} index={i} clock={clock} sliders={sliders} />
    ))}
    <p class="note">The three dots on the right edge of the display. Handy for status at a glance.</p>
  </>
);

/** One indicator (1–3): its dot, colour, mode and on/off switch. */
const IndicatorRow: FC<Props & { index: number }> = ({ index: i, clock, sliders }) => {
  const colorRef = useRef<HTMLInputElement>(null);
  const modeRef = useRef<HTMLSelectElement>(null);
  const name = NAMES[i - 1];
  const ind = clock.live.dev?.indicators?.[i - 1];
  const color = ind?.color && ind.color !== "#000000" ? toHex(ind.color).toLowerCase() : null;
  const mode = ind ? (ind.blinkMs ? "blink" : ind.fadeMs ? "fade" : "solid") : null;

  /** Turns the indicator on with the row's colour and mode, or off. */
  const send = (on: boolean): void => {
    const c = colorRef.current!.value;
    const m = modeRef.current!.value;
    const blinkMs = on && m === "blink" ? 500 : 0;
    const fadeMs = on && m === "fade" ? 1500 : 0;
    const dev = clock.live.dev;
    if (dev?.indicators?.[i - 1]) {
      // show it straight away
      const indicators = dev.indicators.map((x, k) =>
        k === i - 1 ? { ...x, on, color: c, blinkMs, fadeMs } : x,
      );
      clock.setDevice({ ...dev, indicators });
    }
    clock.pub(`indicators/${i}`, on ? { color: c, blinkMs, fadeMs } : { color: 0 });
  };

  return (
    <div class="ind">
      <span
        class={`ind-dot ${ind?.on && ind.blinkMs ? "blink" : ""} ${ind?.on && ind.fadeMs ? "fade" : ""}`}
        style={{ background: ind?.on ? toHex(ind.color) : "transparent" }}
      />
      <span class="ind-name">{name}</span>
      <input
        ref={colorRef}
        type="color"
        class="ind-color"
        defaultValue="#FF0000"
        data-k={`ind${i}c`}
        aria-label={`${name} indicator color`}
        value={sliders.held(`ind${i}c`, color)}
        onChange={() => send(true)}
      />
      <select
        ref={modeRef}
        class="ind-mode"
        aria-label={`${name} indicator mode`}
        onChange={() => send(true)}
      >
        {MODES.map(([v, label]) => (
          <option key={v} value={v} selected={mode === v}>
            {label}
          </option>
        ))}
      </select>
      <button
        class={`switch ind-toggle ${ind?.on ? "on" : ""}`}
        aria-label={`${name} indicator on/off`}
        onClick={() => send(!ind?.on)}
      >
        <span />
      </button>
    </div>
  );
};
