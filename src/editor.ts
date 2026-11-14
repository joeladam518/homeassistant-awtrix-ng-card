import { html, LitElement, nothing } from "lit";

import type { AwtrixNgCardConfig } from "./clock-card.ts";
import type { HomeAssistant } from "./lib/types.ts";

const LABELS: Record<string, string> = {
  prefix: "Clock (MQTT prefix)",
  name: "Card title (optional)",
  preview: "Show live display preview",
  preview_interval: "Preview refresh",
};

/** The visual editor for the clock card: pick a clock from the ones Home Assistant found. */
export class AwtrixNgCardEditor extends LitElement {
  static override properties = {
    hass: { attribute: false },
    _config: { state: true },
  };

  declare hass?: HomeAssistant;
  declare _config?: AwtrixNgCardConfig;

  setConfig(config: AwtrixNgCardConfig): void {
    this._config = { ...config };
  }

  private _label = (s: { name: string }): string => LABELS[s.name] || s.name;

  private _changed(e: CustomEvent<{ value: AwtrixNgCardConfig }>): void {
    this._config = e.detail.value;
    this.dispatchEvent(
      new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }),
    );
  }

  override render(): unknown {
    if (!this.hass || !this._config) return nothing;
    const prefixes = Object.values(this.hass.states)
      .filter(
        (e) => /mqtt_prefix/.test(e.entity_id) && e.state && !["unknown", "unavailable"].includes(e.state),
      )
      .map((e) => ({ value: e.state, label: `${e.state}  (${e.attributes.friendly_name || e.entity_id})` }));
    const schema = [
      {
        name: "prefix",
        required: true,
        selector: { select: { options: prefixes, custom_value: true, mode: "dropdown" } },
      },
      { name: "name", selector: { text: {} } },
      { name: "preview", selector: { boolean: {} } },
      {
        name: "preview_interval",
        selector: { number: { min: 500, max: 10000, step: 250, mode: "box", unit_of_measurement: "ms" } },
      },
    ];
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${{ preview: true, preview_interval: 2000, ...this._config }}
        .schema=${schema}
        .computeLabel=${this._label}
        @value-changed=${this._changed}
      ></ha-form>
    `;
  }
}
