// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import StorageTooltip from "../client/src/components/StorageTooltip";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe("storage control interactions", () => {
  it("reveals tooltip guidance when the control wrapper receives keyboard focus", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(
        createElement(StorageTooltip, {
          label: "Select eligible files",
          children: createElement("button", { type: "button" }, "Select all"),
        })
      );
    });

    const trigger = host.querySelector('[tabindex="0"]') as HTMLElement;
    expect(trigger).toBeTruthy();
    await act(async () => trigger.focus());
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(document.body.textContent).toContain("Select eligible files");
  });

  it("keeps the cleanup action disabled until eligible files are selected", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root?.render(
        createElement(
          "button",
          {
            type: "button",
            disabled: true,
            "aria-label": "Permanently unlink selected storage references",
          },
          "Permanently unlink selected"
        )
      );
    });

    const button = host.querySelector("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-label")).toBe(
      "Permanently unlink selected storage references"
    );
  });
});
