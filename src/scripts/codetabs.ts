/**
 * Code tabs: arrow keys and clicks switch the panel, and a panel's Copy
 * button copies its code. Shared by src/components/CodeTabs.astro and the
 * tindocs pages, whose install tabs come from Markdown.
 */
for (const root of document.querySelectorAll<HTMLElement>("[data-codetabs]")) {
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const select = (tab: HTMLButtonElement) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute("aria-controls")!);
      if (panel) panel.hidden = !on;
    }
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (e) => {
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      const next = tabs[(i + step + tabs.length) % tabs.length];
      select(next);
      next.focus();
    });
  });
}

for (const button of document.querySelectorAll<HTMLButtonElement>(".codetabs [data-copy]")) {
  if (button.dataset.bound) continue;
  button.dataset.bound = "1";
  button.addEventListener("click", async () => {
    const code = button.parentElement?.querySelector("code")?.textContent ?? "";
    try {
      await navigator.clipboard.writeText(code);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Select it";
    }
    setTimeout(() => (button.textContent = "Copy"), 1600);
  });
}
