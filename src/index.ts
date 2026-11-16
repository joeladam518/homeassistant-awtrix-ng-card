import { defineOnce, logVersion, registerCard } from "@joeladam518/shared-cards/register.ts";

import { AwtrixNgCard } from "./clock-card.ts";
import { AwtrixNgCardEditor } from "./editor.ts";

defineOnce("awtrix-ng-card", AwtrixNgCard);
defineOnce("awtrix-ng-card-editor", AwtrixNgCardEditor);

registerCard({
  type: "awtrix-ng-card",
  name: "AWTRIX NG Clock",
  description: "Live preview and full control of an AWTRIX NG pixel clock over MQTT.",
  preview: false,
  documentationURL: "https://blueforcer.github.io/awtrix-ng/",
});

logVersion("AWTRIX-NG-CARD", __VERSION__, "#f5a568");
