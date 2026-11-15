import React from "react";
import PageHead from "../../components/shell/PageHead.jsx";
import AdminLayout from "./AdminLayout.jsx";
import UiKit from "./uikit/UiKit.jsx";

/** Staff-only review surface for the Discover UI kit. Route /admin/ui-kit; not linked from the nav. */
export default function AdminUiKit() {
  return (
    <AdminLayout>
      <PageHead title="UI kit" subtitle="Every shared component in every state. Check here before adding a component." />
      <UiKit />
    </AdminLayout>
  );
}
