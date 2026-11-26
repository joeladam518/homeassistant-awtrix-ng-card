import { createEditorElement, type EditorProps, haProps } from "homeassistant-ui-shared";
import type { FunctionComponent as FC } from "preact";

import type { AwtrixNgCardConfig } from "./clock-card.tsx";

const LABELS: Record<string, string> = {
  prefix: "Clock (MQTT prefix)",
  name: "Card title (optional)",
  preview: "Show live display preview",
  preview_interval: "Preview refresh",
};

const computeLabel = (s: { name: string }): string => LABELS[s.name] || s.name;

/** The visual editor for the clock card: pick a clock from the ones Home Assistant found. */
export const AwtrixNgCardEditor: FC<EditorProps<AwtrixNgCardConfig>> = ({ config, hass, onChange }) => {
  const prefixes = Object.values(hass.states)
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

  return (
    <ha-form
      ref={haProps({
        hass,
        data: { preview: true, preview_interval: 2000, ...config },
        schema,
        computeLabel,
      })}
      onvalue-changed={(e: CustomEvent<{ value: AwtrixNgCardConfig }>) => onChange(e.detail.value)}
    />
  );
};

export const AwtrixNgCardEditorElement = createEditorElement(AwtrixNgCardEditor);
