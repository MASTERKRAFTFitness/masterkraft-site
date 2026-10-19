"use client";

import { useWindows } from "./useWindows";

/** "Get in on the founding round." until it closes, then the open round's name. */
export default function JoinHeading() {
  const { windows } = useWindows(1);
  const name = windows?.[0]?.name ?? "Founding round";
  const round = name === "Founding round" ? "founding round" : `${name.toLowerCase()} round`;
  return <>Get in on the {round}.</>;
}
