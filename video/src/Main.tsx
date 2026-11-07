import React from "react";
import { AbsoluteFill, Html5Audio, interpolate, staticFile } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { buildScenes } from "./scenes";
import { C } from "./theme";

/** Склейка между сценами, кадров */
const T = 14;
/** Музыка: Mixkit, лицензия Mixkit Free (без указания автора). Запасной трек: music/your-breath.mp3 */
export const MUSIC = "music/deep-urban.mp3";

const scenes = buildScenes();

export function totalFrames() {
  return scenes.reduce((a, s) => a + s.frames, 0) - T * (scenes.length - 1);
}

export const Main: React.FC = () => {
  const total = totalFrames();
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <TransitionSeries>
        {scenes.flatMap((s, i) => {
          const items = [
            <TransitionSeries.Sequence key={s.id} durationInFrames={s.frames}>
              <s.Component />
            </TransitionSeries.Sequence>,
          ];
          if (i < scenes.length - 1) {
            // Демо подряд: та же рамка браузера, меняется только содержимое, без провала по яркости
            const chain = s.demo && scenes[i + 1].demo;
            items.push(
              <TransitionSeries.Transition
                key={`${s.id}-t`}
                presentation={fade({ shouldFadeOutExitingScene: !chain })}
                timing={linearTiming({ durationInFrames: T })}
              />,
            );
          }
          return items;
        })}
      </TransitionSeries>
      <Html5Audio
        src={staticFile(MUSIC)}
        volume={(f) => interpolate(f, [0, 20, total - 75, total - 5], [0, 0.6, 0.6, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
      />
    </AbsoluteFill>
  );
};
