import {
  act,
  type FakeHass,
  fakeHass,
  flush,
  stubHaElements,
  tick,
} from "@joeladam518/homeassistant-ui-shared/testing";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AwtrixNgCardElement as AwtrixNgCard } from "./clock-card.tsx";

beforeAll(async () => {
  stubHaElements();
  await import("./index.ts");
});

beforeEach(() => localStorage.clear());

async function mount(hass: FakeHass, config: Record<string, unknown> = {}): Promise<AwtrixNgCard> {
  const card = document.createElement("awtrix-ng-card") as AwtrixNgCard;
  await act(() => {
    card.setConfig({ type: "custom:awtrix-ng-card", prefix: "clock1", preview: false, ...config });
    card.hass = hass;
    document.body.append(card);
  });
  // let the MQTT subscriptions finish
  await tick();
  await flush();
  return card;
}

const $ = <T extends Element = HTMLElement>(card: AwtrixNgCard, sel: string) =>
  card.shadowRoot!.querySelector<T>(sel)!;
const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const tab = (card: AwtrixNgCard, label: string) =>
  [...card.shadowRoot!.querySelectorAll<HTMLElement>(".tabs button")].find(
    (t) => clean(t.textContent) === label,
  )!;

function online(hass: FakeHass) {
  hass.mqtt("clock1/availability", "online");
  hass.mqtt("clock1/state/device", {
    hostname: "awtrix-kitchen",
    currentApp: "Time",
    matrixPower: true,
    brightness: 128,
    batteryPercent: 64,
    temperature: 21.36,
    humidity: 40.4,
    wifiRssi: -58,
    version: "1.2.3",
    ipAddress: "10.0.0.5",
    uptimeSeconds: 3 * 3600 + 120,
    indicators: [
      { on: true, color: "#FF0000", blinkMs: 500, fadeMs: 0 },
      { on: false, color: "#000000" },
      { on: false, color: "#000000" },
    ],
  });
  hass.mqtt("clock1/state/settings", {
    brightness: 128,
    autoTransition: true,
    appDurationMs: 7000,
    uppercase: true,
  });
  hass.mqtt("clock1/state/capabilities", {
    transitions: ["Slide", "Fade"],
    effects: ["Matrix"],
    overlays: [],
  });
}

describe("awtrix-ng-card", () => {
  it("is listed in the card picker", () => {
    expect(window.customCards?.map((c) => c.type)).toEqual(["awtrix-ng-card"]);
  });

  it("listens to the clock's state, availability and error topics", async () => {
    const hass = fakeHass();
    await mount(hass);
    const topics = (
      hass.connection.subscribeMessage as unknown as { mock: { calls: [unknown, { topic: string }][] } }
    ).mock.calls.map(([, m]) => m.topic);
    expect(topics).toEqual(["clock1/state/#", "clock1/availability", "clock1/event/error"]);
  });

  it("shows the clock's name, status, chips and current app from MQTT", async () => {
    const hass = fakeHass();
    const card = await mount(hass);
    online(hass);
    await flush();
    expect(clean($(card, ".name").textContent)).toBe("awtrix-kitchen");
    expect(clean($(card, ".sub").textContent)).toBe("Online · 32×8 · clock1");
    expect($(card, ".dot").classList.contains("ok")).toBe(true);
    const chips = [...card.shadowRoot!.querySelectorAll(".chip")].map((c) => clean(c.textContent));
    expect(chips).toEqual(["64%", "21.4°C", "40%", "-58 dBm"]);
    expect(clean($(card, ".app-pill span").textContent)).toBe("Time");
    expect(clean($(card, ".row .val").textContent)).toBe("50%");
  });

  it("warns when the user isn't an admin", async () => {
    const card = await mount(fakeHass({}, { admin: false }));
    expect($(card, ".banner").hidden).toBe(false);
    expect(clean($(card, ".banner").textContent)).toMatch(/needs an admin user/);
  });

  it("sends a message with the chosen options and remembers it", async () => {
    const hass = fakeHass();
    const card = await mount(hass);
    online(hass);
    await flush();
    $<HTMLInputElement>(card, "#msgText").value = "Washer done";
    $<HTMLInputElement>(card, "#msgColor").value = "#00ff00";
    $<HTMLInputElement>(card, "#msgIcon").value = "1234";
    $(card, ".actions .btn.primary").click();
    await flush();
    const [topic, payload] = hass.published().at(-1)!;
    expect(topic).toBe("clock1/cmd/notify");
    expect(JSON.parse(payload)).toEqual({
      text: "Washer done",
      textColor: "#00FF00",
      icon: "1234",
      durationMs: 10000,
    });
    expect($<HTMLInputElement>(card, "#msgText").value).toBe("");
    expect(clean($(card, ".recent .chip-btn").textContent)).toBe("Washer done");
    expect(JSON.parse(localStorage.getItem("awtrix-ng-card:clock1:msg")!)).toMatchObject({
      color: "#00FF00",
      icon: "1234",
    });
  });

  it("won't send an empty message", async () => {
    const hass = fakeHass();
    const card = await mount(hass);
    $(card, ".actions .btn.primary").click();
    await flush();
    expect(hass.published()).toEqual([]);
    expect(clean($(card, ".toast").textContent)).toBe("Type a message (or pick an icon) first");
  });

  it("turns the display off and changes brightness", async () => {
    const hass = fakeHass();
    const card = await mount(hass);
    online(hass);
    await flush();
    $(card, ".power").click();
    await flush();
    expect(hass.published().at(-1)).toEqual(["clock1/cmd/display", '{"power":false}']);
    expect($(card, ".screen-wrap").classList.contains("off")).toBe(true);

    const bri = $<HTMLInputElement>(card, ".row input[type=range]");
    bri.value = "200";
    bri.dispatchEvent(new Event("change"));
    expect(hass.published().at(-1)).toEqual([
      "clock1/cmd/settings",
      '{"brightness":200,"autoBrightness":false}',
    ]);
  });

  it("keeps a dragged brightness slider in place when it isn't focused (Safari)", async () => {
    const hass = fakeHass();
    const card = await mount(hass);
    online(hass);
    await flush();
    const bri = $<HTMLInputElement>(card, ".row input[type=range]");
    expect(card.shadowRoot!.querySelector(":focus")).toBeNull();

    // Drag without focus, and the clock reports its old value mid-drag.
    bri.value = "200";
    bri.dispatchEvent(new Event("input"));
    await flush();
    hass.mqtt("clock1/state/settings", { brightness: 128, autoBrightness: false });
    await flush();
    expect(bri.value).toBe("200");
    expect(clean($(card, ".bright .val").textContent)).toBe("78%");

    bri.dispatchEvent(new Event("change"));
    await flush();
    expect(hass.published().at(-1)).toEqual([
      "clock1/cmd/settings",
      '{"brightness":200,"autoBrightness":false}',
    ]);
    // No blur ever comes, but the draft is gone, so new state shows again.
    hass.mqtt("clock1/state/settings", { brightness: 50, autoBrightness: false });
    await flush();
    expect(bri.value).toBe("50");
  });

  it("shows indicators and switches one off", async () => {
    const hass = fakeHass();
    const card = await mount(hass);
    online(hass);
    tab(card, "Indicators").click();
    await flush();
    const top = card.shadowRoot!.querySelector<HTMLElement>(".ind")!;
    expect(top.querySelector(".ind-dot")!.classList.contains("blink")).toBe(true);
    expect(top.querySelector<HTMLSelectElement>(".ind-mode")!.value).toBe("blink");
    top.querySelector<HTMLElement>(".ind-toggle")!.click();
    expect(hass.published().at(-1)).toEqual(["clock1/cmd/indicators/1", '{"color":0}']);
  });

  it("shows device info and the transition list on the Display tab", async () => {
    const hass = fakeHass();
    const card = await mount(hass);
    online(hass);
    tab(card, "Display").click();
    await flush();
    expect(clean($(card, ".info").textContent)).toBe("Firmware 1.2.3 · IP 10.0.0.5 · Up 3h 2m");
    const options = [...card.shadowRoot!.querySelectorAll("section:not([hidden]) select option")].map(
      (o) => o.textContent,
    );
    expect(options).toContain("Slide");
    expect(clean($(card, "section:not([hidden]) .slider .val").textContent)).toBe("7 s");
  });

  it("hides the Sound tab when the clock has no speaker", async () => {
    const hass = fakeHass();
    const card = await mount(hass);
    online(hass);
    await flush();
    const tabs = [...card.shadowRoot!.querySelectorAll<HTMLElement>(".tabs button")];
    expect(tabs.filter((t) => !t.hidden).map((t) => clean(t.textContent))).toEqual([
      "Message",
      "Indicators",
      "Display",
    ]);
  });

  it("shows the clock's error events as a toast", async () => {
    const hass = fakeHass();
    const card = await mount(hass);
    hass.mqtt("clock1/event/error", { request: "clock1/cmd/notify", error: { message: "bad icon" } });
    await flush();
    expect(clean($(card, ".toast").textContent)).toBe("Clock rejected notify: bad icon");
  });
});
