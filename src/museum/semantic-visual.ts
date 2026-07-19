import type { ChannelBinding, SemanticVisualLayer, VisualChannel } from './portrait-types.ts';
import type { WorkManifest } from './types.ts';

export interface NumericVisualValue {
  normalized: number;
  encodedValue: number;
  outsideDomain: boolean;
}

export function visualLayers(work: WorkManifest): SemanticVisualLayer[] {
  return work.schemaVersion === 2 ? work.portrait.visualMappings : [];
}

export function findVisualBinding(
  work: WorkManifest,
  quantityRef: string,
  channel?: VisualChannel,
): ChannelBinding | null {
  return (
    visualLayers(work)
      .flatMap((layer) => layer.bindings)
      .find(
        (binding) =>
          binding.quantityRef === quantityRef &&
          (channel === undefined || binding.channel === channel),
      ) ?? null
  );
}

export function requireVisualBinding(
  work: WorkManifest,
  quantityRef: string,
  channel: VisualChannel,
): ChannelBinding {
  const binding = findVisualBinding(work, quantityRef, channel);
  if (!binding) {
    throw new Error(`No reviewed ${channel} binding exists for ${quantityRef}.`);
  }
  return binding;
}

export function numericDomain(binding: ChannelBinding): readonly [number, number] {
  const [minimum, maximum] = binding.domain;
  if (
    typeof minimum !== 'number' ||
    typeof maximum !== 'number' ||
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum) ||
    !(maximum > minimum)
  ) {
    throw new Error(`Binding ${binding.quantityRef}/${binding.channel} needs a numeric domain.`);
  }
  return [minimum, maximum];
}

function symlog(value: number): number {
  return Math.sign(value) * Math.log1p(Math.abs(value));
}

function wrap(value: number, minimum: number, maximum: number): number {
  const span = maximum - minimum;
  return minimum + ((((value - minimum) % span) + span) % span);
}

export function encodeNumericValue(value: number, binding: ChannelBinding): NumericVisualValue {
  if (!Number.isFinite(value)) {
    throw new Error(
      `Binding ${binding.quantityRef}/${binding.channel} received a non-finite value.`,
    );
  }
  if (binding.scale === 'categorical') {
    throw new Error(
      `Categorical binding ${binding.quantityRef}/${binding.channel} is not numeric.`,
    );
  }
  const [minimum, maximum] = numericDomain(binding);
  const outsideDomain = value < minimum || value > maximum;
  const encodedValue =
    binding.outOfDomain === 'wrap-cyclic' ? wrap(value, minimum, maximum) : value;
  const bounded = Math.min(maximum, Math.max(minimum, encodedValue));
  let normalized: number;
  switch (binding.scale) {
    case 'linear':
      normalized = (bounded - minimum) / (maximum - minimum);
      break;
    case 'sqrt':
      normalized = Math.sqrt((bounded - minimum) / (maximum - minimum));
      break;
    case 'log': {
      if (!(minimum > 0) || !(bounded > 0)) {
        throw new Error(`Log binding ${binding.quantityRef}/${binding.channel} requires > 0.`);
      }
      normalized =
        (Math.log(bounded) - Math.log(minimum)) / (Math.log(maximum) - Math.log(minimum));
      break;
    }
    case 'symlog':
      normalized = (symlog(bounded) - symlog(minimum)) / (symlog(maximum) - symlog(minimum));
      break;
    case 'cyclic':
      normalized = (wrap(value, minimum, maximum) - minimum) / (maximum - minimum);
      break;
  }
  if (!Number.isFinite(normalized)) {
    throw new Error(
      `Binding ${binding.quantityRef}/${binding.channel} produced a non-finite mark.`,
    );
  }
  return { normalized: Math.min(1, Math.max(0, normalized)), encodedValue, outsideDomain };
}

/** Returns the reviewed mark baseline for area/width/position geometry. */
export function normalizedZero(binding: ChannelBinding): number | null {
  if (binding.zero === undefined) return null;
  if (!Number.isFinite(binding.zero)) {
    throw new Error(`Binding ${binding.quantityRef}/${binding.channel} has a non-finite zero.`);
  }
  const [minimum, maximum] = numericDomain(binding);
  if (binding.zero < minimum || binding.zero > maximum) {
    throw new Error(
      `Binding ${binding.quantityRef}/${binding.channel} zero is outside its numeric domain.`,
    );
  }
  const bindingWithoutZero: ChannelBinding = { ...binding };
  delete bindingWithoutZero.zero;
  return encodeNumericValue(binding.zero, bindingWithoutZero).normalized;
}

export function describeBinding(binding: ChannelBinding): string {
  const domain = binding.domain.join(' … ');
  const unit = binding.unit ? ` ${binding.unit}` : '';
  const event =
    binding.channel === 'event-frequency'
      ? `; one event per ${binding.eventQuantum}${unit} from ${binding.eventAccumulatorRef}`
      : '';
  const zero = binding.zero === undefined ? '' : `; zero ${binding.zero}${unit}`;
  return `${binding.quantityRef} → ${binding.channel}; ${binding.scale}; domain ${domain}${unit}${zero}; ${binding.outOfDomain}${event}`;
}
