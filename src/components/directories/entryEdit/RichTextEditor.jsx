import React, { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";

// Extension config is deliberately restricted to exactly what
// sanitizeNotesHtml (src/lib/sanitizeHtml.js) allows through on save —
// strike/code/codeBlock/horizontalRule are disabled here because their
// output tags (s/code/pre/hr) get silently stripped by the sanitizer,
// which would otherwise look like editor data loss.
function buildExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      strike: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
    }),
    Underline,
    Link.configure({
      openOnClick: false,
      autolink: true,
      protocols: ["http", "https", "mailto", "tel"],
    }),
  ];
}

function ToolbarButton({ onClick, active, disabled, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        minWidth: 28,
        height: 28,
        padding: "0 6px",
        fontSize: 13,
        fontWeight: 600,
        borderRadius: 6,
        border: "1px solid var(--lc-border)",
        background: active ? "var(--lc-brand, #4a9baa)" : "#fff",
        color: active ? "#fff" : "inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

/**
 * WYSIWYG editor for directory_entries.notes_html — TipTap StarterKit plus
 * Underline/Link, restricted to the tag set sanitizeNotesHtml allows.
 * Controlled by `value`/`onChange` (plain HTML string), not by TipTap's own
 * uncontrolled document state, so callers can save/reset it like any input.
 */
export default function RichTextEditor({ value, onChange, editable = true }) {
  const editor = useEditor({
    extensions: buildExtensions(),
    content: value || "",
    editable,
    onUpdate: ({ editor: e }) => onChange?.(e.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    // Only resync when the value changed externally (e.g. a reload after
    // save) — pushing on every keystroke would fight the user's cursor.
    if ((value || "") !== current) editor.commands.setContent(value || "", { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  function setLink() {
    if (!editor) return;
    const previous = editor.getAttributes("link").href || "";
    // eslint-disable-next-line no-alert
    const url = window.prompt("Link URL (http(s), mailto: or tel:)", previous);
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  if (!editor) return null;

  return (
    <div style={{ border: "1px solid var(--lc-border)", borderRadius: 8, overflow: "hidden" }}>
      {editable && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: 6, borderBottom: "1px solid var(--lc-border)", background: "#f9fafb" }}>
          <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><i>B</i></ToolbarButton>
          <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></ToolbarButton>
          <ToolbarButton label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></ToolbarButton>
          <ToolbarButton label="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarButton>
          <ToolbarButton label="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolbarButton>
          <ToolbarButton label="Heading 4" active={editor.isActive("heading", { level: 4 })} onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}>H4</ToolbarButton>
          <ToolbarButton label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>•—</ToolbarButton>
          <ToolbarButton label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.</ToolbarButton>
          <ToolbarButton label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>"</ToolbarButton>
          <ToolbarButton label="Link" active={editor.isActive("link")} onClick={setLink}>🔗</ToolbarButton>
          <ToolbarButton label="Clear formatting" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>Tx</ToolbarButton>
        </div>
      )}
      <div style={{ padding: "10px 12px", minHeight: 160, fontSize: 14, lineHeight: 1.5 }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
