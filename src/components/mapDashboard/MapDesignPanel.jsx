import React from "react";
import { Button } from "../ui";
import { DraftStatus } from "./controls.jsx";
import {
  ClusterColoursSection, CustomIconSection, DropShadowSection, PinColoursSection, PinIconSection, PinStyleSection,
} from "./PinDesignFields.jsx";

/**
 * Pin design tab: style, colours, drop shadow and pin icon for every pin on the map. Draft auto-saves (the page owns that).
 * Values and setters are the page's state; nothing is held here.
 * @param {object} props
 */
export default function MapDesignPanel({
  draftStatus, markerStyle, onMarkerStyleChange, pinSize, onPinSizeChange, enableClustering,
  markerColor, onMarkerColorChange, pinBorderColor, onPinBorderColorChange, pinBorderSize, onPinBorderSizeChange,
  clusterColor, onClusterColorChange, clusterOpacity, onClusterOpacityChange,
  pinDropShadow, onPinDropShadowChange, pinShadowDistance, onPinShadowDistanceChange, pinShadowOpacity, onPinShadowOpacityChange,
  customPinUrl, onCustomPinUrlChange, customPinUploading, onCustomPinFile, customPinInputRef,
  pinFaviconUrl, onPinFaviconUrlChange, onError,
}) {
  const design = {
    color: markerColor,
    borderColor: pinBorderColor,
    borderWidth: pinBorderSize,
    faviconUrl: pinFaviconUrl,
    dropShadowPx: pinDropShadow,
    dropShadowDistance: pinShadowDistance,
    dropShadowOpacity: pinShadowOpacity,
    customUrl: customPinUrl,
  };
  const cluster = enableClustering
    ? { color: { value: clusterColor, onChange: onClusterColorChange }, opacity: { value: clusterOpacity, onChange: onClusterOpacityChange } }
    : null;
  return (
    <div className="md-stack">
      <DraftStatus status={draftStatus} />

      <PinStyleSection
        idPrefix="map-pin"
        styleValue={markerStyle}
        onStyleChange={onMarkerStyleChange}
        design={design}
        pinSize={pinSize}
        onPinSizeChange={onPinSizeChange}
        customFileInputRef={customPinInputRef}
        onCustomFile={onCustomPinFile}
      />

      {markerStyle === "custom" ? (
        <CustomIconSection
          url={customPinUrl}
          uploading={customPinUploading}
          onFile={onCustomPinFile}
          extraAction={customPinUrl ? <Button size="sm" onClick={() => onCustomPinUrlChange("")}>Remove</Button> : null}
        />
      ) : null}

      {markerStyle !== "custom" ? (
        <PinColoursSection
          marker={{ value: markerColor, onChange: onMarkerColorChange }}
          border={{ value: pinBorderColor, onChange: onPinBorderColorChange }}
          borderSize={{ value: pinBorderSize, onChange: onPinBorderSizeChange }}
          cluster={cluster}
        />
      ) : null}

      {enableClustering && markerStyle === "custom" ? (
        <ClusterColoursSection
          color={{ value: clusterColor, onChange: onClusterColorChange }}
          opacity={{ value: clusterOpacity, onChange: onClusterOpacityChange }}
        />
      ) : null}

      {markerStyle !== "custom" ? (
        <DropShadowSection
          size={{ value: pinDropShadow, onChange: onPinDropShadowChange }}
          distance={{ value: pinShadowDistance, onChange: onPinShadowDistanceChange }}
          opacity={{ value: pinShadowOpacity, onChange: onPinShadowOpacityChange }}
        />
      ) : null}

      {markerStyle === "pin" || markerStyle === "teardrop" ? (
        <PinIconSection
          url={pinFaviconUrl}
          onValue={onPinFaviconUrlChange}
          onError={onError}
          actions={pinFaviconUrl ? <Button size="sm" onClick={() => onPinFaviconUrlChange("")}>Remove</Button> : null}
        />
      ) : null}
    </div>
  );
}
