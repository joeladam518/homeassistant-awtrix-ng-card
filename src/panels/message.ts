import { html, type TemplateResult } from "lit";
import { styleMap } from "lit/directives/style-map.js";

import type { AwtrixNgCard } from "../clock-card.ts";
import { DEFAULT_DURATION_MS, DURATIONS } from "../notify.ts";

/** Message tab: send a notification with colour or rainbow text, an icon, duration, background and chime. */
export function renderMessagePanel(card: AwtrixNgCard): TemplateResult {
  const last = card._last;
  const effects = card._caps?.effects || [];
  return html`
    <div class="field">
      <input
        type="text"
        id="msgText"
        placeholder="Type a message for the clock…"
        maxlength="300"
        value=${last.text || ""}
        @keydown=${(e: KeyboardEvent) => e.key === "Enter" && card._send()}
      />
    </div>
    <div class="grid2">
      <label
        >Color
        <span class="color-row">
          <input type="color" id="msgColor" value=${last.color || "#FFFFFF"} />
          <button
            class="chip-btn ${card._rainbow ? "on" : ""}"
            title="Rainbow text"
            @click=${() => (card._rainbow = !card._rainbow)}
          >
            Rainbow
          </button>
        </span>
      </label>
      <label
        >Show for
        <select id="msgDur">
          ${DURATIONS.map(
            (d) => html`<option value=${d.ms} ?selected=${d.ms === DEFAULT_DURATION_MS}>${d.label}</option>`,
          )}
        </select>
      </label>
      <label
        >Icon <a class="hint" href="https://awtrix.de/icons/" target="_blank" rel="noopener">find IDs</a>
        <input type="text" id="msgIcon" placeholder="e.g. 1234" value=${last.icon || ""} />
      </label>
      <label
        >Background
        <select id="msgEffect">
          <option value="">None</option>
          ${effects.map((e) => html`<option value=${e}>${e}</option>`)}
        </select>
      </label>
    </div>
    <label class="check"><input type="checkbox" id="msgSound" ?checked=${!!last.sound} /> Play a chime</label>
    <div class="actions">
      <button
        class="btn ghost"
        @click=${() => {
          card._pub("notify/dismiss", "");
          card._toast.show("Notification dismissed");
        }}
      >
        <ha-icon icon="mdi:bell-off-outline"></ha-icon>Dismiss
      </button>
      <button class="btn primary" @click=${() => card._send()}>
        <ha-icon icon="mdi:send"></ha-icon>Send
      </button>
    </div>
    <div class="recent">
      ${
        card._recent.length
          ? html`<span class="note">Recent</span> ${card._recent.map(
                (r) =>
                  html`<button
                    class="chip-btn"
                    style=${styleMap({ "--c": r.rainbow ? "var(--primary-color)" : r.color || "#FFFFFF" })}
                    @click=${() => card._useRecent(r)}
                  >
                    <span class="sw"></span>${r.text || `icon ${r.icon}`}
                  </button>`,
              )}`
          : ""
      }
    </div>
  `;
}
