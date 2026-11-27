import React from "react";
import { ConfirmProvider, ToastProvider } from "../ui/index.js";
import PageBlocksEditor from "./PageBlocksEditor.jsx";

/**
 * The block editor for surfaces outside the app shell (the Listing Manager, which renders in its own frame without the
 * shell's toast and confirm providers or its Discover UI scope). `.shell--embedded` keeps the scope but drops the
 * full-height page chrome (see blocks-editor.css).
 */
export default function EmbeddedBlocksEditor(props) {
  return (
    <div className="shell shell--embedded">
      <ToastProvider>
        <ConfirmProvider>
          <PageBlocksEditor {...props} />
        </ConfirmProvider>
      </ToastProvider>
    </div>
  );
}
