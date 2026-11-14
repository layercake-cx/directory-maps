import { useEffect } from "react";

const PRODUCT = "Discover by Layercake";

/**
 * Sets the browser tab title for admin and client-portal routes: "{title} · Discover by Layercake" when
 * `title` is a non-empty string, otherwise just "Discover by Layercake". The previous title is restored
 * on unmount so public routes, which share index.html's static title, are unaffected.
 */
export default function useDocumentTitle(title) {
  const text = typeof title === "string" && title.trim() ? title.trim() : null;
  useEffect(() => {
    const previous = document.title;
    document.title = text ? `${text} · ${PRODUCT}` : PRODUCT;
    return () => { document.title = previous; };
  }, [text]);
}
