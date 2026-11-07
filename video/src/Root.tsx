import React from "react";
import { Composition } from "remotion";
import { Main, totalFrames } from "./Main";
import { FPS, H, W } from "./theme";
import { loadFonts } from "./fonts";

loadFonts();

export const Root: React.FC = () => (
  <Composition id="MGIMOHub" component={Main} durationInFrames={totalFrames()} fps={FPS} width={W} height={H} />
);
