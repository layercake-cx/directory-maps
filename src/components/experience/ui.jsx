import "./experience.css";

/**
 * These components moved to src/components/ui/ in the Discover UI kit (phase 2). This file only
 * re-exports them so existing imports keep working; it is deleted in phase 7.
 */
export {
  SegmentedControl, ContrastBadge, ColourField, OptionalColourField, contrastOf,
  Dialog, ConfirmDialog, NameDialog, OverflowMenu, SaveBar, useUnsavedGuard, useTabKeys,
} from "../ui/index.js";
