import React, { forwardRef, useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { SpinnerIcon } from "./icons.jsx";

/**
 * Button: the one button. Wraps `.shell-btn`.
 * @param {{
 *   variant?: "primary"|"secondary"|"ghost"|"danger"|"danger-solid",
 *   size?: "md"|"sm",
 *   icon?: React.ReactNode,
 *   iconOnly?: boolean,           // requires aria-label
 *   loading?: boolean,            // disables, sets aria-busy, swaps the label for loadingLabel
 *   loadingLabel?: string,        // use the verb: "Saving…", "Publishing…"
 *   as?: "button"|"a"|typeof Link,
 *   to?: string,                  // with as={Link}
 *   disabledReason?: string,      // visible reason shown next to a disabled button
 * }} props
 */
const Button = forwardRef(function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconOnly = false,
  loading = false,
  loadingLabel = "Working…",
  as,
  disabled = false,
  disabledReason,
  className = "",
  children,
  type,
  ...rest
}, forwardedRef) {
  const Tag = as || "button";
  const reasonId = useId();
  const ref = useRef(null);
  const setRef = useCallback((el) => {
    ref.current = el;
    if (typeof forwardedRef === "function") forwardedRef(el);
    else if (forwardedRef) forwardedRef.current = el;
  }, [forwardedRef]);
  const [width, setWidth] = useState(null); // dynamic: keeps the button width stable while loading

  useEffect(() => {
    if (loading && ref.current && width == null) setWidth(ref.current.offsetWidth);
    if (!loading && width != null) setWidth(null);
  }, [loading, width]);

  const isDisabled = disabled || loading;
  const cls = [
    "shell-btn",
    variant !== "secondary" && `shell-btn--${variant}`,
    size === "sm" && "shell-btn--sm",
    iconOnly && "shell-btn--icon",
    className,
  ].filter(Boolean).join(" ");

  const props = { ...rest, ref: setRef, className: cls };
  if (loading) props["aria-busy"] = "true";
  if (disabled && disabledReason) props["aria-describedby"] = reasonId;
  if (width != null) props.style = { ...(rest.style || {}), minWidth: width };

  if (Tag === "button") {
    props.type = type || "button";
    props.disabled = isDisabled;
  } else if (isDisabled) {
    props["aria-disabled"] = "true";
    props.tabIndex = -1;
    props.onClick = (e) => e.preventDefault();
  }

  const content = loading ? (
    <>
      <SpinnerIcon />
      {iconOnly ? null : <span>{loadingLabel}</span>}
    </>
  ) : (
    <>
      {icon}
      {children}
    </>
  );

  return (
    <>
      <Tag {...props}>{content}</Tag>
      {disabled && disabledReason ? <span id={reasonId} className="btn-reason">{disabledReason}</span> : null}
    </>
  );
});

export default Button;
