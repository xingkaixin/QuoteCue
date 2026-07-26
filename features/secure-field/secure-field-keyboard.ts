type SaveKeyboardEvent = Pick<KeyboardEvent, "ctrlKey" | "isComposing" | "key" | "metaKey">;

export function isSecureFieldSaveShortcut(event: SaveKeyboardEvent, kind: "input" | "textarea") {
  return (
    event.key === "Enter" &&
    !event.isComposing &&
    (kind === "input" || event.metaKey || event.ctrlKey)
  );
}
