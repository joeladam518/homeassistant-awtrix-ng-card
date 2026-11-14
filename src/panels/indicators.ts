import { html, type TemplateResult } from "lit";
import { styleMap } from "lit/directives/style-map.js";

import type { AwtrixNgCard } from "../clock-card.ts";
import { toHex } from "../format.ts";

const NAMES = ["Top", "Middle", "Bottom"];
const MODES = [
  ["solid", "Solid"],
  ["blink", "Blink"],
  ["fade", "Pulse"],
] as const;

/** Turns indicator `i` (1–3) on with the row's colour and mode, or off. */
function sendIndicator(card: AwtrixNgCard, i: number, on: boolean, row: HTMLElement): void {
  const color = row.querySelector<HTMLInputElement>(".ind-color")!.value;
  const mode = row.querySelector<HTMLSelectElement>(".ind-mode")!.value;
  const blinkMs = on && mode === "blink" ? 500 : 0;
  const fadeMs = on && mode === "fade" ? 1500 : 0;
  const ind = card._dev?.indicators?.[i - 1];
  if (ind) Object.assign(ind, { on, color, blinkMs, fadeMs }); // show it straight away
  card._pub(`indicators/${i}`, on ? { color, blinkMs, fadeMs } : { color: 0 });
  card.requestUpdate();
}

/** The indicator row a control is in. */
const row = (e: Event) => (e.currentTarget as HTMLElement).closest<HTMLElement>(".ind")!;

/** Indicators tab: the three status dots on the right edge of the display. */
export function renderIndicatorsPanel(card: AwtrixNgCard): TemplateResult {
  return html`
    ${[1, 2, 3].map((i) => {
      const name = NAMES[i - 1];
      const ind = card._dev?.indicators?.[i - 1];
      const color = ind?.color && ind.color !== "#000000" ? toHex(ind.color).toLowerCase() : null;
      const mode = ind ? (ind.blinkMs ? "blink" : ind.fadeMs ? "fade" : "solid") : null;
      return html`<div class="ind">
        <span
          class="ind-dot ${ind?.on && ind.blinkMs ? "blink" : ""} ${ind?.on && ind.fadeMs ? "fade" : ""}"
          style=${styleMap({ background: ind?.on ? toHex(ind.color) : "transparent" })}
        ></span>
        <span class="ind-name">${name}</span>
        <input
          type="color"
          class="ind-color"
          value="#FF0000"
          data-k="ind${i}c"
          aria-label="${name} indicator color"
          .value=${card._held(`ind${i}c`, color)}
          @change=${(e: Event) => sendIndicator(card, i, true, row(e))}
        />
        <select
          class="ind-mode"
          aria-label="${name} indicator mode"
          @change=${(e: Event) => sendIndicator(card, i, true, row(e))}
        >
          ${MODES.map(([v, label]) => html`<option value=${v} ?selected=${mode === v}>${label}</option>`)}
        </select>
        <button
          class="switch ind-toggle ${ind?.on ? "on" : ""}"
          aria-label="${name} indicator on/off"
          @click=${(e: Event) => sendIndicator(card, i, !card._dev?.indicators?.[i - 1]?.on, row(e))}
        >
          <span></span>
        </button>
      </div>`;
    })}
    <p class="note">The three dots on the right edge of the display. Handy for status at a glance.</p>
  `;
}
