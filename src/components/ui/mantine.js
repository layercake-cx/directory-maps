// The only place outside main.jsx that imports @mantine/core. Mantine is kept for two uses that live outside
// the admin shell: the claim pages' drafting-prompt modal (they render in a client's own brand) and the entry
// card preview. New code must use the kit instead. Remove this file with Mantine (see BACKLOG.md).
export { Modal, Text } from "@mantine/core";
