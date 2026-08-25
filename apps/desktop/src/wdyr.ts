import React from "react";

if (import.meta.env.DEV) {
  const { default: wdyr } = await import("@welldone-software/why-did-you-render");
  const zustand = await import("zustand");
  const zustandMutable = { ...zustand };
  wdyr(React, {
    trackAllPureComponents: false,
    trackHooks: true,
    logOnDifferentValues: true,
    trackExtraHooks: [[zustandMutable, "useStore"]],
  });
}
