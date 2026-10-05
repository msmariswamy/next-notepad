import { APP_INFO } from "./appInfo";

/** Help > About: name, version and credit. Resolves when the dialog is closed. */
export function openAboutDialog(): HTMLDialogElement {
  const dialog = document.createElement("dialog");
  dialog.className = "about";
  dialog.setAttribute("data-testid", "about-dialog");

  const title = document.createElement("h2");
  title.textContent = APP_INFO.name;
  const version = document.createElement("p");
  version.className = "about-version";
  version.textContent = `Version ${APP_INFO.version}`;
  const credit = document.createElement("p");
  credit.className = "about-credit";
  credit.textContent = APP_INFO.credit;
  const copyright = document.createElement("p");
  copyright.className = "about-copyright";
  copyright.textContent = `© ${APP_INFO.year} ${APP_INFO.author}`;
  const close = document.createElement("button");
  close.textContent = "Close";
  close.addEventListener("click", () => dialog.close());

  dialog.append(title, version, credit, copyright, close);
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
