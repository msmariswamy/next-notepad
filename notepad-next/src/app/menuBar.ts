import { formatAccelerator, isMac, matchesAccelerator } from "./accelerators";
import { MENU, type Command, type MenuItem } from "./commands";

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

  const buildItems = (items: MenuItem[]): HTMLElement[] =>
    items.map((entry) => {
      if (entry === "-") {
        const sep = document.createElement("div");
        sep.className = "menu-sep";
        return sep;
      }
      if (typeof entry !== "string") return buildSubmenu(entry.label, entry.items);
      const cmd = byId.get(entry)!;
      const item = document.createElement("button");
      item.className = "menu-item";
      item.setAttribute("role", cmd.checked ? "menuitemcheckbox" : "menuitem");
      item.dataset.command = entry;
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
    });

  /** Shift a nested menu up, or flip it to the left, so it never runs off the window. */
  const keepOnScreen = (nested: HTMLElement) => {
    nested.style.top = "-4px";
    nested.classList.remove("flip");
    const r = nested.getBoundingClientRect();
    if (r.right > window.innerWidth - 4) nested.classList.add("flip");
    const overflow = r.bottom - (window.innerHeight - 8);
    if (overflow > 0) nested.style.top = `${Math.max(-4 - overflow, -(r.top - 4) - 4)}px`;
  };

  /** An item that opens a nested list to its right, on hover or click. */
  const buildSubmenu = (title: string, items: MenuItem[]): HTMLElement => {
    const holder = document.createElement("div");
    holder.className = "menu-submenu";
    const trigger = document.createElement("button");
    trigger.className = "menu-item menu-submenu-trigger";
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.dataset.submenu = title;
    const check = document.createElement("span");
    check.className = "menu-check";
    const label = document.createElement("span");
    label.className = "menu-label";
    label.textContent = title;
    const arrow = document.createElement("kbd");
    arrow.textContent = "▸";
    trigger.append(check, label, arrow);
    const nested = document.createElement("div");
    nested.className = "menu-dropdown menu-nested";
    nested.setAttribute("role", "menu");
    nested.hidden = true;
    const open = () => {
      for (const other of holder.parentElement?.querySelectorAll(":scope > .menu-submenu > .menu-nested") ?? []) {
        if (other !== nested) (other as HTMLElement).hidden = true;
      }
      if (nested.hidden) nested.replaceChildren(...buildItems(items)); // fresh checked states
      nested.hidden = false;
      keepOnScreen(nested);
    };
    trigger.addEventListener("mouseenter", open);
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      open();
    });
    holder.append(trigger, nested);
    return holder;
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
      dropdown.replaceChildren(...buildItems(menu.items));
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
    // Stop the editor's own keymap from also handling the key (e.g. Cmd+/ or Cmd+]), which would run it twice.
    e.stopPropagation();
    void c.run();
    return true;
  }
  return false;
}
