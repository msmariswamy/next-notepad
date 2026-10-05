import { formatAccelerator, isMac, matchesAccelerator } from "./accelerators";
import { MENU, type Command } from "./commands";

/** In-page menu bar: click a title to open it, hover to switch, Escape or an outside click closes. */
export function renderMenuBar(nav: HTMLElement, commands: Command[]): { close(): void } {
  const byId = new Map(commands.map((c) => [c.id, c]));
  nav.replaceChildren();
  nav.setAttribute("role", "menubar");
  const mac = isMac();
  let openMenu: HTMLElement | null = null;

  const close = () => {
    openMenu?.setAttribute("hidden", "");
    openMenu?.parentElement?.classList.remove("open");
    openMenu = null;
  };

  for (const menu of MENU) {
    const wrapper = document.createElement("div");
    wrapper.className = "menu";
    const title = document.createElement("button");
    title.className = "menu-title";
    title.textContent = menu.label;
    const dropdown = document.createElement("div");
    dropdown.className = "menu-dropdown";
    dropdown.setAttribute("role", "menu");
    dropdown.hidden = true;

    const show = () => {
      if (openMenu === dropdown) return;
      close();
      // Checked states depend on the active tab, so rebuild the items each time the menu opens.
      dropdown.replaceChildren(
        ...menu.items.map((id) => {
          if (id === "-") {
            const sep = document.createElement("div");
            sep.className = "menu-sep";
            return sep;
          }
          const cmd = byId.get(id)!;
          const item = document.createElement("button");
          item.className = "menu-item";
          item.setAttribute("role", cmd.checked ? "menuitemcheckbox" : "menuitem");
          item.dataset.command = id;
          const check = document.createElement("span");
          check.className = "menu-check";
          const on = cmd.checked?.() ?? false;
          check.textContent = on ? "✓" : "";
          if (cmd.checked) item.setAttribute("aria-checked", String(on));
          const label = document.createElement("span");
          label.className = "menu-label";
          label.textContent = cmd.label;
          const accel = document.createElement("kbd");
          accel.textContent = cmd.accelerator ? formatAccelerator(cmd.accelerator, mac) : "";
          item.append(check, label, accel);
          item.addEventListener("click", () => {
            close();
            void cmd.run();
          });
          return item;
        }),
      );
      dropdown.hidden = false;
      wrapper.classList.add("open");
      openMenu = dropdown;
    };
    title.addEventListener("click", () => (openMenu === dropdown ? close() : show()));
    title.addEventListener("mouseenter", () => openMenu && show());
    wrapper.append(title, dropdown);
    nav.append(wrapper);
  }

  document.addEventListener("mousedown", (e) => {
    if (openMenu && !nav.contains(e.target as Node)) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openMenu) close();
  });
  return { close };
}

/** Run the command whose accelerator matches the key event; returns true if one ran. */
export function dispatchShortcut(e: KeyboardEvent, commands: Command[]): boolean {
  for (const c of commands) {
    if (!c.accelerator || c.native || !matchesAccelerator(e, c.accelerator)) continue;
    e.preventDefault();
    void c.run();
    return true;
  }
  return false;
}
