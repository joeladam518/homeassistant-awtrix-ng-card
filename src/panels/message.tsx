import {
  buildNotify,
  DEFAULT_DURATION_MS,
  DURATIONS,
  loadRecent,
  lsGet,
  lsSet,
  type RecentMessage,
  saveRecent,
} from "homeassistant-ui-shared";
import type { FunctionComponent as FC } from "preact";
import { useRef, useState } from "preact/hooks";

import type { ClockApi } from "../use-clock.ts";

export type LastMessage = RecentMessage & { sound?: boolean };

export const storageKey = (prefix: string, what: "msg" | "recent") => `awtrix-ng-card:${prefix}:${what}`;

interface Props {
  clock: ClockApi;
}

/**
 * Message tab: send a notification with colour or rainbow text, an icon, duration, background and chime.
 * Starts with the style used last time on this clock.
 */
export const MessagePanel: FC<Props> = ({ clock }) => {
  const [last] = useState(() => lsGet<LastMessage>(storageKey(clock.prefix, "msg"), { text: "" }));
  const [rainbow, setRainbow] = useState(!!last.rainbow);
  const [recent, setRecent] = useState(() => loadRecent(storageKey(clock.prefix, "recent")));

  const textRef = useRef<HTMLInputElement>(null);
  const colorRef = useRef<HTMLInputElement>(null);
  const iconRef = useRef<HTMLInputElement>(null);
  const durRef = useRef<HTMLSelectElement>(null);
  const effectRef = useRef<HTMLSelectElement>(null);
  const soundRef = useRef<HTMLInputElement>(null);
  const effects = clock.live.caps?.effects || [];

  const send = (): void => {
    const text = textRef.current!.value.trim();
    const icon = iconRef.current!.value.trim();
    if (!text && !icon) {
      clock.toast("Type a message (or pick an icon) first");
      textRef.current!.focus();
      return;
    }
    const color = colorRef.current!.value.toUpperCase();
    const dur = Number(durRef.current!.value);
    const effect = effectRef.current!.value;
    const sound = soundRef.current!.checked;

    clock.pub("notify", buildNotify({ text, color, rainbow, icon, dur, effect, sound }));
    clock.toast(dur < 0 ? "Sent — it stays until you tap Dismiss" : "Sent to the clock");
    // Remember the style for next time, not the text.
    lsSet(storageKey(clock.prefix, "msg"), { text: "", color, icon, rainbow, sound });
    setRecent(saveRecent(storageKey(clock.prefix, "recent"), { text, color, icon, rainbow }, 5));
    textRef.current!.value = "";
    clock.schedulePreview(600);
  };

  /** Put a recent message back in the form. */
  const applyRecent = (r: RecentMessage): void => {
    textRef.current!.value = r.text;
    colorRef.current!.value = r.color || "#FFFFFF";
    iconRef.current!.value = r.icon || "";
    setRainbow(!!r.rainbow);
    textRef.current!.focus();
  };

  return (
    <>
      <div class="field">
        <input
          ref={textRef}
          type="text"
          id="msgText"
          placeholder="Type a message for the clock…"
          maxLength={300}
          defaultValue={last.text || ""}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
      </div>
      <div class="grid2">
        <label>
          Color
          <span class="color-row">
            <input ref={colorRef} type="color" id="msgColor" defaultValue={last.color || "#FFFFFF"} />
            <button
              class={`chip-btn ${rainbow ? "on" : ""}`}
              title="Rainbow text"
              onClick={() => setRainbow(!rainbow)}
            >
              Rainbow
            </button>
          </span>
        </label>
        <label>
          Show for
          <select ref={durRef} id="msgDur">
            {DURATIONS.map((d) => (
              <option key={d.ms} value={d.ms} selected={d.ms === DEFAULT_DURATION_MS}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Icon{" "}
          <a class="hint" href="https://awtrix.de/icons/" target="_blank" rel="noopener">
            find IDs
          </a>
          <input
            ref={iconRef}
            type="text"
            id="msgIcon"
            placeholder="e.g. 1234"
            defaultValue={last.icon || ""}
          />
        </label>
        <label>
          Background
          <select ref={effectRef} id="msgEffect">
            <option value="">None</option>
            {effects.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label class="check">
        <input ref={soundRef} type="checkbox" id="msgSound" defaultChecked={!!last.sound} /> Play a chime
      </label>
      <div class="actions">
        <button
          class="btn ghost"
          onClick={() => {
            clock.pub("notify/dismiss", "");
            clock.toast("Notification dismissed");
          }}
        >
          <ha-icon icon="mdi:bell-off-outline" />
          Dismiss
        </button>
        <button class="btn primary" onClick={send}>
          <ha-icon icon="mdi:send" />
          Send
        </button>
      </div>
      <div class="recent">
        {recent.length > 0 && (
          <>
            <span class="note">Recent</span>{" "}
            {recent.map((r, i) => (
              <button
                key={i}
                class="chip-btn"
                style={{ "--c": r.rainbow ? "var(--primary-color)" : r.color || "#FFFFFF" }}
                onClick={() => applyRecent(r)}
              >
                <span class="sw" />
                {r.text || `icon ${r.icon}`}
              </button>
            ))}
          </>
        )}
      </div>
    </>
  );
};
