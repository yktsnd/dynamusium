import { useEffect, useState } from 'react';
import { formatAmount, formatTime } from '../../lib/formatting/format.ts';
import { selectCurrentFrame } from '../../state/selectors.ts';
import { useSimulationStore } from '../../state/simulation-store.ts';
import './controls.css';

const ANNOUNCE_INTERVAL_MS = 5000;

/** Build the current status sentence from a fresh read of the store. */
function describeStatus(): string {
  const state = useSimulationStore.getState();
  const { model, playing, status, error } = state;
  const frame = selectCurrentFrame(state);

  if (status === 'invalid' || frame === null) {
    return `Simulation invalid: ${error?.message ?? 'the solver could not produce a usable solution.'} Playback is stopped. Use reset to restore the preset.`;
  }

  const speciesText = model.species
    .map(
      (species, i) => `${species.label} ${formatAmount(frame.quantities[i])} ${model.quantityUnit}`,
    )
    .join(', ');
  const reservoirText = `collected output ${formatAmount(frame.reservoir)} ${model.quantityUnit}`;
  const statusWord = playing ? 'Running' : 'Paused';

  return `${statusWord} at ${formatTime(frame.time, model.timeUnit)}. ${speciesText}, ${reservoirText}.`;
}

/**
 * Visually hidden aria-live region describing simulation state for screen
 * reader users. Announcements are throttled to at most once every 5 seconds
 * of wall clock while playing, and update immediately whenever play/pause
 * state changes. Purely descriptive — reads the store, never writes to it.
 */
export function StatusAnnouncer() {
  const playing = useSimulationStore((s) => s.playing);
  const [announcement, setAnnouncement] = useState(describeStatus);

  useEffect(() => {
    const announce = () => setAnnouncement(describeStatus());
    // Announce the play/pause flip on the next tick, then throttle while playing.
    const immediate = setTimeout(announce, 0);
    const id = playing ? setInterval(announce, ANNOUNCE_INTERVAL_MS) : undefined;
    return () => {
      clearTimeout(immediate);
      if (id !== undefined) clearInterval(id);
    };
  }, [playing]);

  return (
    <div aria-live="polite" className="visually-hidden" data-testid="status-announcer">
      {announcement}
    </div>
  );
}
