import React, { useState } from "react";

/**
 * Renders a logo image scaled to fit within max dimensions while sizing the
 * container to the image's aspect ratio, so wide or tall logos don't leave
 * lots of whitespace (they use the full budget in one dimension).
 */
export default function LogoImage({
  src,
  wrapClassName = "",
  imgClassName = "",
  maxWidth = 280,
  maxHeight = 90,
}) {
  const [size, setSize] = useState(null);

  function onLoad(e) {
    const img = e.target;
    const nw = img.naturalWidth || 1;
    const nh = img.naturalHeight || 1;
    const scale = Math.min(maxWidth / nw, maxHeight / nh, 1);
    setSize({
      width: Math.round(nw * scale),
      height: Math.round(nh * scale),
    });
  }

  return (
    <div
      className={wrapClassName}
      style={{
        maxWidth,
        maxHeight,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <img
        src={src}
        alt=""
        className={imgClassName}
        style={
          size
            ? { width: size.width, height: size.height, objectFit: "contain" }
            : undefined
        }
        onLoad={onLoad}
      />
    </div>
  );
}
