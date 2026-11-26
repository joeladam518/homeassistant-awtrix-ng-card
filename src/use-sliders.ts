import { heldValue } from "homeassistant-ui-shared";
import { useState } from "preact/hooks";

/** Draft values for sliders while the user drags them, and the handlers that go with them. */
export interface Sliders {
  /** Slider values while the user is dragging them, by slider key. */
  drafts: Record<string, number>;
  /**
   * The `value` for a control marked `data-k={key}`: `undefined` (leave it alone) while the user
   * is using it, or when there's no value yet. So incoming state never fights the user.
   *
   * "Using it" means focused, or a slider mid-drag (it has a draft). The draft check matters:
   * Safari and the iOS / macOS apps don't focus a slider you drag, so without it every
   * re-render would snap the slider back to the old value and the change would never be sent.
   */
  held: (key: string, value: unknown) => string | undefined;
  /** onInput for a slider: remember the dragged value so its label follows. */
  onInput: (key: string) => (e: Event) => void;
  /**
   * onChange for a slider: send the value, then drop the draft. Done here and not only on blur,
   * because blur never comes when the slider was never focused (Safari).
   */
  onChange: (key: string, send: (value: number) => void) => (e: Event) => void;
  /** onBlur for a slider, or to drop a draft by hand. */
  clear: (key: string) => () => void;
}

export function useSliders(root: DocumentOrShadowRoot | null): Sliders {
  const [drafts, setDrafts] = useState<Record<string, number>>({});

  const clear = (key: string) => () => {
    setDrafts((d) => {
      if (!(key in d)) {
        return d;
      }
      const { [key]: _gone, ...rest } = d;
      return rest;
    });
  };

  return {
    drafts,
    held: (key, value) => (key in drafts ? undefined : heldValue(root, key, value)),
    onInput: (key) => (e) => {
      const value = Number((e.currentTarget as HTMLInputElement).value);
      setDrafts((d) => ({ ...d, [key]: value }));
    },
    onChange: (key, send) => (e) => {
      send(Number((e.currentTarget as HTMLInputElement).value));
      clear(key)();
    },
    clear,
  };
}
