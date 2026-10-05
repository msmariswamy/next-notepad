import type { UnsavedChoice } from "./platform";

/** In-page Save / Don't Save / Cancel prompt (a <dialog>, so it is testable in WebKit). */
export function confirmUnsavedDialog(title: string): Promise<UnsavedChoice> {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "confirm";
    dialog.setAttribute("data-testid", "confirm-unsaved");
    const msg = document.createElement("p");
    msg.textContent = `Save file "${title}"?`;
    const row = document.createElement("div");
    row.className = "confirm-buttons";
    let answer: UnsavedChoice = "cancel";
    const button = (label: string, choice: UnsavedChoice) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.addEventListener("click", () => {
        answer = choice;
        dialog.close();
      });
      return b;
    };
    row.append(button("Save", "save"), button("Don't Save", "discard"), button("Cancel", "cancel"));
    dialog.append(msg, row);
    // Escape closes the dialog without a button press, which counts as Cancel.
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(answer);
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

/** Generic OK / Cancel confirmation (used before Replace in Files writes anything). */
export function confirmDialog(message: string, okLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "confirm";
    dialog.setAttribute("data-testid", "confirm-dialog");
    const msg = document.createElement("p");
    msg.textContent = message;
    const row = document.createElement("div");
    row.className = "confirm-buttons";
    let ok = false;
    const ok_ = document.createElement("button");
    ok_.textContent = okLabel;
    ok_.addEventListener("click", () => ((ok = true), dialog.close()));
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => dialog.close());
    row.append(ok_, cancel);
    dialog.append(msg, row);
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(ok);
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}
