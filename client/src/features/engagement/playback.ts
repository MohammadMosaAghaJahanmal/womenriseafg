import { useRef, type SyntheticEvent } from 'react';
import { rememberResource, savedPosition, type LearningResource } from './local';

type Event = SyntheticEvent<HTMLMediaElement>;

export function usePlaybackProgress(resource?: LearningResource) {
  const recorded = useRef(0);
  function save(event: Event, finished = false) {
    const player = event.currentTarget;
    if (!resource || !Number.isFinite(player.duration) || player.duration <= 0) return;
    if (rememberResource(resource, player.currentTime, player.duration, finished)) recorded.current = player.currentTime;
  }
  return {
    onLoadedMetadata(event: Event) {
      const player = event.currentTarget;
      if (!resource || !Number.isFinite(player.duration)) return;
      const position = savedPosition(resource)?.position;
      if (position && position < player.duration - 0.5) player.currentTime = position;
      recorded.current = player.currentTime;
    },
    onTimeUpdate(event: Event) {
      if (Math.abs(event.currentTarget.currentTime - recorded.current) >= 5) save(event);
    },
    onPause(event: Event) { if (event.currentTarget.currentTime > 0) save(event); },
    onSeeked(event: Event) { save(event); },
    onEnded(event: Event) { save(event, true); },
  };
}
