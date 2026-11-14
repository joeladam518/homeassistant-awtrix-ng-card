import { html, type TemplateResult } from "lit";

import type { AwtrixNgCard } from "../clock-card.ts";
import { fmtUptime, toHex } from "../format.ts";

const capitalize = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** Two taps to reboot: the first arms the button for 3.5 s. */
function onReboot(card: AwtrixNgCard, e: Event): void {
  const btn = e.currentTarget as HTMLButtonElement;
  const label = btn.querySelector("span")!;
  if (btn.classList.contains("confirm")) {
    btn.classList.remove("confirm");
    label.textContent = "Reboot";
    card._pub("device/reboot", "");
    card._toast.show("Rebooting the clock…");
    return;
  }
  btn.classList.add("confirm");
  label.textContent = "Tap again to reboot";
  clearTimeout(Number(btn.dataset.timer));
  btn.dataset.timer = String(
    setTimeout(() => {
      btn.classList.remove("confirm");
      label.textContent = "Reboot";
    }, 3500),
  );
}

/** Display tab: app rotation, transitions, text colour, overlay, mood light, device info and reboot. */
export function renderDisplayPanel(card: AwtrixNgCard): TemplateResult {
  const s = card._set || {};
  const d = card._dev || {};
  const caps = card._caps || {};
  const appDur = card._drafts.appDur ?? (s.appDurationMs != null ? Math.round(s.appDurationMs / 1000) : null);
  const transDur = card._drafts.transDur ?? s.transitionDurationMs;
  const moodColor = () => card._q("#moodColor").value;
  const info = [
    d.version && `Firmware ${d.version}`,
    d.ipAddress && `IP ${d.ipAddress}`,
    d.uptimeSeconds != null && `Up ${fmtUptime(d.uptimeSeconds)}`,
    d.fps != null && `${d.fps} fps`,
  ].filter(Boolean);

  return html`
    <div class="line">
      <span>Rotate apps automatically</span>
      <button
        class="switch ${(s.autoTransition ?? true) ? "on" : ""}"
        aria-label="Rotate apps automatically"
        @click=${() => card._settings({ autoTransition: !(s.autoTransition ?? true) })}
      >
        <span></span>
      </button>
    </div>
    <div class="line">
      <span>Time per app</span>
      <span class="slider">
        <input
          type="range"
          min="2"
          max="60"
          step="1"
          data-k="appDur"
          .value=${card._held("appDur", s.appDurationMs != null ? Math.round(s.appDurationMs / 1000) : null)}
          @input=${card._draft("appDur")}
          @change=${card._commit("appDur", (v) => card._settings({ appDurationMs: v * 1000 }))}
          @blur=${card._clearDraft("appDur")}
        />
        <span class="val">${appDur != null ? `${appDur} s` : ""}</span>
      </span>
    </div>
    <div class="line">
      <span>Transition</span>
      <select
        @change=${(e: Event) => card._settings({ transitionEffect: (e.target as HTMLSelectElement).value })}
      >
        ${(caps.transitions || []).map(
          (t) => html`<option value=${t} ?selected=${t === s.transitionEffect}>${t}</option>`,
        )}
      </select>
    </div>
    <div class="line">
      <span>Transition speed</span>
      <span class="slider">
        <input
          type="range"
          min="0"
          max="3000"
          step="100"
          data-k="transDur"
          .value=${card._held("transDur", s.transitionDurationMs)}
          @input=${card._draft("transDur")}
          @change=${card._commit("transDur", (v) => card._settings({ transitionDurationMs: v }))}
          @blur=${card._clearDraft("transDur")}
        />
        <span class="val">${transDur != null ? `${(transDur / 1000).toFixed(1)} s` : ""}</span>
      </span>
    </div>
    <div class="line">
      <span>Default text color</span>
      <input
        type="color"
        data-k="textColor"
        .value=${card._held("textColor", s.textColor ? toHex(s.textColor).toLowerCase() : null)}
        @change=${(e: Event) =>
          card._settings({ textColor: (e.target as HTMLInputElement).value.toUpperCase() })}
      />
    </div>
    <div class="line">
      <span>Uppercase text</span>
      <button
        class="switch ${(s.uppercase ?? true) ? "on" : ""}"
        aria-label="Uppercase text"
        @click=${() => card._settings({ uppercase: !(s.uppercase ?? true) })}
      >
        <span></span>
      </button>
    </div>
    <div class="line" ?hidden=${!caps.overlays?.length}>
      <span>Weather overlay</span>
      <select
        @change=${(e: Event) => card._pub("display", { overlay: (e.target as HTMLSelectElement).value || null })}
      >
        <option value="">None</option>
        ${(caps.overlays || []).map((o) => html`<option value=${o}>${capitalize(o)}</option>`)}
      </select>
    </div>
    <div class="line">
      <span>Mood light</span>
      <span class="color-row">
        <input
          type="color"
          id="moodColor"
          value="#FF8C32"
          @change=${() => card._pub("display/moodlight", { color: moodColor(), brightness: 120 })}
        />
        <button
          class="chip-btn"
          @click=${() => card._pub("display/moodlight", { color: moodColor(), brightness: 120 })}
        >
          On
        </button>
        <button class="chip-btn" @click=${() => card._pub("display/moodlight", "")}>Off</button>
      </span>
    </div>
    <div class="info">${info.join(" · ")}</div>
    <div class="actions">
      <a
        class="btn ghost"
        target="_blank"
        rel="noopener"
        ?hidden=${!d.ipAddress}
        href=${d.ipAddress ? `http://${d.ipAddress}/` : "#"}
      >
        <ha-icon icon="mdi:open-in-new"></ha-icon>Clock web page
      </a>
      <button class="btn ghost danger" @click=${(e: Event) => onReboot(card, e)}>
        <ha-icon icon="mdi:restart"></ha-icon><span>Reboot</span>
      </button>
    </div>
  `;
}
