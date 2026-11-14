import type { HomeAssistant } from "./lib/types.ts";

export interface MqttMessage {
  topic: string;
  payload: string;
}

export type Unsubscribe = () => void;

/** Listen to an MQTT topic through Home Assistant. Only admin users are allowed to. */
export function subscribeTopic(
  hass: HomeAssistant,
  topic: string,
  onMessage: (msg: MqttMessage) => void,
): Promise<Unsubscribe> {
  return hass.connection.subscribeMessage<MqttMessage>(onMessage, { type: "mqtt/subscribe", topic, qos: 0 });
}

/** Payload for mqtt.publish: strings as-is, nothing as "", anything else as JSON. */
export const toPayload = (payload: unknown): string =>
  payload == null ? "" : typeof payload === "string" ? payload : JSON.stringify(payload);

/** Send a command to a clock: `<prefix>/cmd/<sub>`. */
export function publish(
  hass: HomeAssistant,
  prefix: string,
  sub: string,
  payload?: unknown,
): Promise<unknown> {
  return hass.callService("mqtt", "publish", { topic: `${prefix}/cmd/${sub}`, payload: toPayload(payload) });
}
