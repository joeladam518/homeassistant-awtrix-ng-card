import { html, type TemplateResult } from "lit";

import type { AwtrixNgCard } from "../clock-card.ts";

const VOLUMES = [
  ["volume", "Master"],
  ["alertVolume", "Alerts & chimes"],
  ["appVolume", "Apps"],
  ["radioVolume", "Radio"],
] as const;

function say(card: AwtrixNgCard): void {
  const input = card._q("#sayText");
  const text = input.value.trim();
  if (!text) {
    return;
  }
  card._pub("audio/play", { speech: text });
  input.value = "";
}

/** Sound tab: volumes, test chime, stop, and on the TC002 internet radio and speech. */
export function renderSoundPanel(card: AwtrixNgCard): TemplateResult {
  const s = card._set || {};
  const caps = card._caps || {};
  const stations = card._audio?.stations || [];
  const radio = card._audio?.radio || {};
  const playing = [radio.station || radio.name, radio.title].filter(Boolean).join(" — ");

  return html`
    <div>
      ${VOLUMES.filter(([key]) => s[key] != null).map(([key, label]) => {
        const shown = card._drafts[key] ?? (s[key] as number);
        return html`<div class="line">
          <span>${label}</span>
          <span class="slider">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              data-k=${key}
              .value=${card._held(key, s[key])}
              @input=${card._draft(key)}
              @change=${card._commit(key, (v) => card._settings({ [key]: v }))}
              @blur=${card._clearDraft(key)}
            />
            <span class="val">${shown}%</span>
          </span>
        </div>`;
      })}
    </div>
    <div class="actions left">
      <button class="btn ghost" @click=${() => card._pub("audio/play", JSON.stringify("ding"))}>
        <ha-icon icon="mdi:bell-ring-outline"></ha-icon>Test chime
      </button>
      <button class="btn ghost" @click=${() => card._pub("audio/stop", "")}>
        <ha-icon icon="mdi:stop"></ha-icon>Stop all sound
      </button>
    </div>
    <div ?hidden=${!(caps.audio?.radio && stations.length)}>
      <div class="subhead">Radio</div>
      <div class="line">
        <select id="station">
          ${stations.map((x, i) => html`<option value=${x.name || i}>${x.name || x.url}</option>`)}
        </select>
        <span class="color-row">
          <button
            class="round small"
            aria-label="Play station"
            @click=${() => {
              const v = card._q<HTMLSelectElement>("#station").value;
              if (v !== "") {
                card._pub("audio/play", { station: /^\d+$/.test(v) ? Number(v) : v });
              }
            }}
          >
            <ha-icon icon="mdi:play"></ha-icon>
          </button>
          <button
            class="round small"
            aria-label="Stop radio"
            @click=${() => card._pub("audio/stop", { group: "radio" })}
          >
            <ha-icon icon="mdi:stop"></ha-icon>
          </button>
        </span>
      </div>
      <div class="note">
        ${radio.playing || radio.state === "playing" ? `Playing: ${playing || "radio"}` : ""}
      </div>
    </div>
    <div ?hidden=${!caps.audio?.speech}>
      <div class="subhead">Speak</div>
      <div class="field inline">
        <input
          type="text"
          id="sayText"
          placeholder="Text for the clock to say out loud"
          @keydown=${(e: KeyboardEvent) => e.key === "Enter" && say(card)}
        />
        <button class="btn primary" @click=${() => say(card)}>
          <ha-icon icon="mdi:account-voice"></ha-icon>Say
        </button>
      </div>
    </div>
  `;
}
