import { defineOnce, logVersion, registerCard } from "homeassistant-ui-shared";

import { AwtrixNgCardElement } from "./clock-card.tsx";
import { AwtrixNgCardEditorElement } from "./editor.tsx";

defineOnce("awtrix-ng-card", AwtrixNgCardElement);
defineOnce("awtrix-ng-card-editor", AwtrixNgCardEditorElement);

registerCard({
  type: "awtrix-ng-card",
  name: "AWTRIX NG Clock",
  description: "Live preview and full control of an AWTRIX NG pixel clock over MQTT.",
  preview: false,
  documentationURL: "https://blueforcer.github.io/awtrix-ng/",
});

logVersion("AWTRIX-NG-CARD", __VERSION__, "#f5a568");
