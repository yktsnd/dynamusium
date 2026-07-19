import { hashCanonical } from './canonical-hash.ts';
import type {
  FormalClass,
  Maturity,
  PortraitCapability,
  PortraitManifestExtension,
  Representation,
  RuntimeKindV2,
  ScientificObjectKind,
  SemanticVisualLayer,
  ValidationRequirementId,
} from './portrait-types.ts';
import type { RenderKind, WorkParameter, WorkPreset } from './types.ts';

interface PortraitDefinition {
  lawRef: string;
  law: string;
  formal: FormalClass;
  representation: Representation;
  runtimeKind: RuntimeKindV2;
  executionProfile: string;
  output: 'trajectory' | 'field-trajectory' | 'ensemble';
  objectKind: ScientificObjectKind;
  primaryTruth: string;
  observableIds: string[];
  visualQuantityIds?: string[];
  visualDomains?: Array<readonly [number, number]>;
  limitations: string[];
  capabilities: PortraitCapability[];
  validations: ValidationRequirementId[];
  reviewedMaturity: Maturity;
}

const coordinate = (id: string, label = id, unit = 'dimensionless') => ({ id, label, unit });

const flow = (
  lawRef: string,
  coordinates: string[],
  options: { autonomous?: boolean; unit?: string } = {},
): FormalClass => ({
  character: 'deterministic',
  stateSpace: {
    kind: 'euclidean',
    dimension: coordinates.length,
    coordinates: coordinates.map((id) => coordinate(id)),
  },
  evolution: {
    kind: options.autonomous === false ? 'process' : 'flow',
    time: { kind: 'continuous', unit: options.unit ?? 'model time' },
    autonomous: options.autonomous ?? true,
    lawRef,
  },
});

const mapClass = (lawRef: string, coordinates: string[]): FormalClass => ({
  character: 'deterministic',
  stateSpace: {
    kind: 'euclidean',
    dimension: coordinates.length,
    coordinates: coordinates.map((id) => coordinate(id)),
  },
  evolution: { kind: 'map', time: { kind: 'discrete', stepUnit: 'iteration' }, lawRef },
});

const fieldClass = (
  lawRef: string,
  components: string[],
  boundary: 'periodic' | 'no-flux' | 'fixed' | 'open' = 'periodic',
  domainDimension: 1 | 2 = 2,
): FormalClass => ({
  character: 'deterministic',
  stateSpace: {
    kind: 'field',
    domainDimension,
    components: components.map((id) => coordinate(id)),
    boundary,
  },
  evolution: {
    kind: 'semiflow',
    time: { kind: 'continuous', unit: 'model time' },
    autonomous: true,
    lawRef,
  },
});

const baseValidations: ValidationRequirementId[] = [
  'finite-output',
  'deterministic-replay',
  'dimension-consistency',
  'parameter-bounds',
];

function definition(
  partial: Omit<PortraitDefinition, 'capabilities' | 'validations' | 'reviewedMaturity'> &
    Partial<Pick<PortraitDefinition, 'capabilities' | 'validations' | 'reviewedMaturity'>>,
): PortraitDefinition {
  return {
    ...partial,
    capabilities: partial.capabilities ?? [],
    validations: [...new Set([...baseValidations, ...(partial.validations ?? [])])],
    reviewedMaturity: partial.reviewedMaturity ?? 'M1',
  };
}

/**
 * Exhaustive reviewed definitions for the permanent collection. A new built-in
 * kernel cannot enter the museum without an entry here.
 */
export const portraitDefinitions = {
  'double-pendulum': definition({
    lawRef: 'double-pendulum-lagrange-v1',
    law: 'Equal-length, equal-mass planar double pendulum in first-order Lagrange form.',
    formal: flow('double-pendulum-lagrange-v1', ['theta1', 'theta2', 'omega1', 'omega2']),
    representation: 'governing-law-execution',
    runtimeKind: 'ode',
    executionProfile: 'rk4-explicit-reviewed',
    output: 'trajectory',
    objectKind: 'orbit-segment',
    primaryTruth: 'Coupling and sensitivity reshape the observed tip orbit.',
    observableIds: ['theta1', 'theta2'],
    visualQuantityIds: ['tip-x', 'tip-y'],
    visualDomains: [
      [-2, 2],
      [-2, 2],
    ],
    limitations: ['Finite trajectory; no chaos classification is inferred.'],
    capabilities: ['recurrence'],
    validations: ['step-halving', 'energy-residual'],
  }),
  kuramoto: definition({
    lawRef: 'kuramoto-finite-population-v1',
    law: 'd theta_i / dt = omega_i + K/N sum_j sin(theta_j-theta_i), N=12.',
    formal: {
      character: 'deterministic',
      stateSpace: {
        kind: 'product',
        factors: Array.from({ length: 12 }, () => 'circle' as const),
        dimension: 12,
        coordinates: Array.from({ length: 12 }, (_, i) =>
          coordinate(`theta-${i + 1}`, `phase ${i + 1}`, 'rad'),
        ),
      },
      evolution: {
        kind: 'flow',
        time: { kind: 'continuous', unit: 'model time' },
        autonomous: true,
        lawRef: 'kuramoto-finite-population-v1',
      },
    },
    representation: 'governing-law-execution',
    runtimeKind: 'ode',
    executionProfile: 'rk4-explicit-reviewed',
    output: 'trajectory',
    objectKind: 'recurrence',
    primaryTruth: 'The order parameter measures the emergence of collective phase coherence.',
    observableIds: ['order-real', 'order-imaginary', 'coherence'],
    limitations: ['Frequency locking is claimed only when mean-frequency evidence passes.'],
    capabilities: ['recurrence', 'empirical-measure', 'frequency'],
    validations: ['step-halving', 'order-parameter-bounds', 'reference-statistic'],
    reviewedMaturity: 'M2',
  }),
  fput: definition({
    lawRef: 'fput-alpha-chain-v1',
    law: 'Fixed-end alpha-FPUT chain: qddot_i = Delta q_i + alpha[(q_{i+1}-q_i)^2-(q_i-q_{i-1})^2], N=8.',
    formal: flow('fput-alpha-chain-v1', [
      ...Array.from({ length: 8 }, (_, i) => `q-${i + 1}`),
      ...Array.from({ length: 8 }, (_, i) => `p-${i + 1}`),
    ]),
    representation: 'governing-law-execution',
    runtimeKind: 'ode',
    executionProfile: 'symplectic-verlet-fput',
    output: 'trajectory',
    objectKind: 'recurrence',
    primaryTruth:
      'Energy placed in the first harmonic mode remains structured and partially returns.',
    observableIds: [
      'mode-1-harmonic-energy',
      'mode-2-harmonic-energy',
      'mode-3-harmonic-energy',
      'mode-4-harmonic-energy',
    ],
    limitations: [
      'Modal energies are harmonic diagnostics; the exact nonlinear Hamiltonian is reported separately.',
    ],
    capabilities: ['recurrence', 'conservation', 'spectral-mode'],
    validations: ['step-halving', 'energy-residual', 'reference-statistic'],
    reviewedMaturity: 'M2',
  }),
  logistic: definition({
    lawRef: 'logistic-map-v1',
    law: 'x_(n+1) = r x_n (1-x_n).',
    formal: mapClass('logistic-map-v1', ['x']),
    representation: 'governing-law-execution',
    runtimeKind: 'map',
    executionProfile: 'direct-map-iteration',
    output: 'trajectory',
    objectKind: 'recurrent-set',
    primaryTruth: 'Repeated nonlinear growth produces parameter-dependent asymptotic sets.',
    observableIds: ['x'],
    visualQuantityIds: ['iteration', 'x'],
    visualDomains: [
      [81, 800],
      [0, 1],
    ],
    limitations: ['Finite post-transient sample; entropy is not inferred.'],
    capabilities: ['recurrence', 'empirical-measure'],
    validations: ['reference-statistic'],
  }),
  wave: definition({
    lawRef: 'wave-equation-modes-v1',
    law: 'u_tt = c^2 (u_xx + u_yy), represented by an exact fixed-boundary modal solution.',
    formal: fieldClass('wave-equation-modes-v1', ['displacement', 'velocity'], 'fixed'),
    representation: 'closed-form-solution',
    runtimeKind: 'analytic',
    executionProfile: 'analytic-wave-mode',
    output: 'field-trajectory',
    objectKind: 'spatial-field',
    primaryTruth:
      'A standing-wave mode exchanges displacement and velocity without diffusive decay.',
    observableIds: ['rms-displacement'],
    visualQuantityIds: ['displacement'],
    visualDomains: [[-1, 1]],
    limitations: ['Single exact modal family, not a general PDE solver.'],
    capabilities: ['frequency', 'conservation'],
    validations: ['grid-refinement', 'energy-residual'],
    reviewedMaturity: 'M2',
  }),
  'standard-map': definition({
    lawRef: 'chirikov-standard-map-v1',
    law: 'p_(n+1)=(p_n+K sin(theta_n)) mod 2pi; theta_(n+1)=(theta_n+p_(n+1)) mod 2pi.',
    formal: mapClass('chirikov-standard-map-v1', ['theta', 'momentum']),
    representation: 'governing-law-execution',
    runtimeKind: 'map',
    executionProfile: 'direct-map-iteration',
    output: 'trajectory',
    objectKind: 'recurrent-set',
    primaryTruth:
      'Area-preserving iteration interleaves regular islands and wandering orbit segments.',
    observableIds: ['theta', 'momentum'],
    visualDomains: [
      [0, Math.PI * 2],
      [0, Math.PI * 2],
    ],
    limitations: ['A single finite orbit does not map the full phase portrait.'],
    capabilities: ['recurrence', 'empirical-measure'],
    validations: ['boundary-residual'],
  }),
  'reaction-chain': definition({
    lawRef: 'fed-reaction-chain-v2',
    law: 'F(t)=F[0.78+0.22 sin(2 pi t/18)]; A_dot=F(t)-kA; B_dot=kA-0.72kB; C_dot=0.72kB-0.48kC; R_dot=0.48kC.',
    formal: flow('fed-reaction-chain-v2', ['a', 'b', 'c', 'collected'], {
      autonomous: false,
      unit: 's',
    }),
    representation: 'governing-law-execution',
    runtimeKind: 'ode',
    executionProfile: 'rk4-positive-reaction',
    output: 'trajectory',
    objectKind: 'flux',
    primaryTruth:
      'Integrated reaction flux moves accounted material through successive quantities under a fully declared oscillating feed.',
    observableIds: [
      'a',
      'b',
      'c',
      'collected',
      'a-to-b-flux',
      'b-to-c-flux',
      'c-to-collected-flux',
      'a-to-b-cumulative',
      'b-to-c-cumulative',
      'c-to-collected-cumulative',
    ],
    limitations: [
      'This is a curated first-order mass-action instrument, not the Michaelis-Menten mechanism.',
    ],
    capabilities: ['flux', 'conservation'],
    validations: ['step-halving', 'positivity', 'mass-balance'],
    reviewedMaturity: 'M2',
  }),
  'gray-scott': definition({
    lawRef: 'gray-scott-periodic-v1',
    law: 'u_t=Du Laplacian(u)-uv^2+F(1-u); v_t=Dv Laplacian(v)+uv^2-(F+k)v on a periodic grid.',
    formal: fieldClass('gray-scott-periodic-v1', ['u', 'v']),
    representation: 'governing-law-execution',
    runtimeKind: 'field',
    executionProfile: 'finite-difference-periodic-gray-scott',
    output: 'field-trajectory',
    objectKind: 'coherent-structure',
    primaryTruth:
      'Local reaction and diffusion organize a perturbed uniform state into persistent concentration structure.',
    observableIds: ['mean-u', 'mean-v', 'variance-v'],
    visualQuantityIds: ['v'],
    visualDomains: [[0, 0.5]],
    limitations: ['Finite grid and finite time; morphology is not a universal phase label.'],
    capabilities: ['coherent-structure', 'spatial-field'],
    validations: ['grid-refinement', 'positivity', 'boundary-residual'],
    reviewedMaturity: 'M2',
  }),
  heat: definition({
    lawRef: 'heat-equation-fourier-family-v1',
    law: 'u_t = kappa Laplacian(u), represented by the exact periodic Fourier evolution of a smooth initial field.',
    formal: fieldClass('heat-equation-fourier-family-v1', ['temperature']),
    representation: 'closed-form-solution',
    runtimeKind: 'analytic',
    executionProfile: 'analytic-heat-fourier',
    output: 'field-trajectory',
    objectKind: 'spatial-field',
    primaryTruth:
      'Diffusion monotonically suppresses spatial variance while preserving the periodic-domain mean.',
    observableIds: ['mean-temperature', 'variance-temperature'],
    visualQuantityIds: ['temperature'],
    visualDomains: [[-1.5, 2]],
    limitations: ['Smooth periodic initial family only.'],
    capabilities: ['conservation', 'decay-rate'],
    validations: ['grid-refinement', 'mass-balance', 'reference-statistic'],
    reviewedMaturity: 'M2',
  }),
  schrodinger: definition({
    lawRef: 'free-schrodinger-gaussian-v1',
    law: 'i psi_t = -(1/2) Laplacian(psi), exact free Gaussian packet in nondimensional units.',
    formal: fieldClass('free-schrodinger-gaussian-v1', ['real', 'imaginary'], 'open'),
    representation: 'closed-form-solution',
    runtimeKind: 'analytic',
    executionProfile: 'analytic-schrodinger-gaussian',
    output: 'field-trajectory',
    objectKind: 'spatial-field',
    primaryTruth:
      'A free Gaussian packet translates and disperses while its probability normalization is retained.',
    observableIds: ['sampled-mean-x', 'analytic-packet-width', 'sampled-domain-norm'],
    visualQuantityIds: ['probabilityDensity'],
    visualDomains: [[0, 8]],
    limitations: ['Free-particle Gaussian family; boundary truncation is reported.'],
    capabilities: ['conservation', 'flux'],
    validations: ['grid-refinement', 'mass-balance', 'reference-statistic'],
    reviewedMaturity: 'M2',
  }),
  ising: definition({
    lawRef: 'ising-metropolis-v1',
    law: '2D nearest-neighbour Ising Gibbs sampler with seeded single-spin Metropolis sweeps and periodic boundary.',
    formal: {
      character: 'stochastic',
      stateSpace: {
        kind: 'finite-configurations',
        siteCount: 1024,
        values: [-1, 1],
        coordinates: [coordinate('spin')],
      },
      evolution: {
        kind: 'markov-chain',
        time: { kind: 'discrete', stepUnit: 'Monte Carlo sweep' },
        transitionLawRef: 'ising-metropolis-v1',
        invariantLawRef: 'ising-gibbs-law-v1',
      },
    },
    representation: 'governing-law-execution',
    runtimeKind: 'stochastic',
    executionProfile: 'seeded-metropolis-sampler',
    output: 'field-trajectory',
    objectKind: 'empirical-measure',
    primaryTruth:
      'A seeded Markov sampler explores temperature-dependent spin configurations; sweep count is not physical time.',
    observableIds: ['magnetization', 'energy', 'acceptance'],
    visualQuantityIds: ['spin'],
    visualDomains: [[-1, 1]],
    limitations: [
      'Finite lattice and finite burn-in; no claim of independent equilibrium samples.',
    ],
    capabilities: ['empirical-measure', 'ensemble'],
    validations: ['seeded-replay', 'reference-statistic', 'boundary-residual'],
    reviewedMaturity: 'M2',
  }),
  'cahn-hilliard': definition({
    lawRef: 'cahn-hilliard-periodic-v1',
    law: 'phi_t=M Laplacian(phi^3-phi-kappa Laplacian(phi)) on a periodic grid.',
    formal: fieldClass('cahn-hilliard-periodic-v1', ['phi']),
    representation: 'governing-law-execution',
    runtimeKind: 'field',
    executionProfile: 'forward-euler-periodic-cahn-hilliard',
    output: 'field-trajectory',
    objectKind: 'interface',
    primaryTruth:
      'Conserved phase separation coarsens interfaces without changing the spatial mean order parameter.',
    observableIds: ['mean-phi', 'free-energy', 'interface-density'],
    visualQuantityIds: ['phi'],
    visualDomains: [[-1, 1]],
    limitations: ['Finite grid and finite-time coarsening.'],
    capabilities: ['interface', 'persistent-homology', 'conservation', 'coherent-structure'],
    validations: ['grid-refinement', 'mass-balance', 'energy-residual', 'boundary-residual'],
    reviewedMaturity: 'M2',
  }),
  'lotka-volterra': definition({
    lawRef: 'lotka-volterra-v1',
    law: 'x_dot=alpha x-beta xy; y_dot=delta xy-gamma y.',
    formal: flow('lotka-volterra-v1', ['prey', 'predator']),
    representation: 'governing-law-execution',
    runtimeKind: 'ode',
    executionProfile: 'rk4-explicit-reviewed',
    output: 'trajectory',
    objectKind: 'periodic-orbit',
    primaryTruth:
      'Predator and prey quantities cycle with a phase offset in the ideal conservative model.',
    observableIds: ['prey', 'predator'],
    visualDomains: [
      [0, 12],
      [0, 12],
    ],
    limitations: ['Ideal closed populations; positivity and first integral are numerical checks.'],
    capabilities: ['recurrence', 'conservation'],
    validations: ['step-halving', 'positivity', 'energy-residual'],
  }),
  brusselator: definition({
    lawRef: 'brusselator-v1',
    law: 'x_dot=A-(B+1)x+x^2y; y_dot=Bx-x^2y.',
    formal: flow('brusselator-v1', ['x', 'y']),
    representation: 'governing-law-execution',
    runtimeKind: 'ode',
    executionProfile: 'rk4-explicit-reviewed',
    output: 'trajectory',
    objectKind: 'attractor',
    primaryTruth:
      'The reaction model crosses from an equilibrium toward a stable oscillation as B changes.',
    observableIds: ['x', 'y'],
    visualDomains: [
      [0, 6],
      [0, 6],
    ],
    limitations: ['Finite-time attraction evidence, not a global bifurcation proof.'],
    capabilities: ['local-stability', 'bifurcation'],
    validations: ['step-halving', 'positivity', 'equilibrium-residual'],
  }),
  oregonator: definition({
    lawRef: 'oregonator-reduced-v1',
    law: 'Three-variable reduced Oregonator kinetics with declared nondimensional coefficients.',
    formal: flow('oregonator-reduced-v1', ['x', 'y', 'z']),
    representation: 'reduced-model',
    runtimeKind: 'ode',
    executionProfile: 'rk4-explicit-reviewed',
    output: 'trajectory',
    objectKind: 'periodic-orbit',
    primaryTruth: 'Fast and slow chemical variables create a repeated relaxation cycle.',
    observableIds: ['x', 'y', 'z'],
    visualDomains: [
      [0, 8],
      [0, 8],
    ],
    limitations: ['Reduced nondimensional kinetics, not a complete reaction mechanism.'],
    capabilities: ['recurrence'],
    validations: ['step-halving', 'positivity'],
  }),
  sir: definition({
    lawRef: 'sir-closed-v1',
    law: 'S_dot=-beta SI; I_dot=beta SI-gamma I; R_dot=gamma I.',
    formal: flow('sir-closed-v1', ['S', 'I', 'R']),
    representation: 'governing-law-execution',
    runtimeKind: 'ode',
    executionProfile: 'rk4-positive-reaction',
    output: 'trajectory',
    objectKind: 'transient-segment',
    primaryTruth:
      'Transmission creates one epidemic transient while total population remains conserved.',
    observableIds: ['S', 'I', 'R'],
    visualDomains: [
      [0, 1],
      [0, 1],
    ],
    limitations: ['Closed homogeneous population.'],
    capabilities: ['conservation'],
    validations: ['step-halving', 'positivity', 'mass-balance'],
  }),
  'hodgkin-huxley': definition({
    lawRef: 'hodgkin-huxley-squid-axon-v1',
    law: 'Classic four-state squid axon membrane equations with analytic removable limits in alpha_m and alpha_n.',
    formal: flow('hodgkin-huxley-squid-axon-v1', ['V', 'm', 'h', 'n']),
    representation: 'governing-law-execution',
    runtimeKind: 'ode',
    executionProfile: 'rk4-hodgkin-huxley',
    output: 'trajectory',
    objectKind: 'periodic-orbit',
    primaryTruth:
      'Ion-channel gating converts sustained current into threshold-dependent voltage spikes.',
    observableIds: ['V', 'm', 'h', 'n'],
    visualDomains: [
      [-100, 60],
      [0, 1],
    ],
    limitations: ['Single-compartment deterministic model.'],
    capabilities: ['recurrence', 'bifurcation'],
    validations: ['step-halving', 'positivity', 'reference-statistic'],
  }),
  'fitzhugh-nagumo': definition({
    lawRef: 'fitzhugh-nagumo-v1',
    law: 'v_dot=v-v^3/3-w+I; w_dot=epsilon(v+a-bw).',
    formal: flow('fitzhugh-nagumo-v1', ['v', 'w']),
    representation: 'reduced-model',
    runtimeKind: 'ode',
    executionProfile: 'rk4-explicit-reviewed',
    output: 'trajectory',
    objectKind: 'periodic-orbit',
    primaryTruth: 'A fast activator and slow recovery variable organize excitable spikes.',
    observableIds: ['v', 'w'],
    visualDomains: [
      [-3, 3],
      [-2, 2],
    ],
    limitations: ['Qualitative reduction, not a conductance model.'],
    capabilities: ['recurrence', 'bifurcation'],
    validations: ['step-halving', 'reference-statistic'],
  }),
  lorenz: definition({
    lawRef: 'lorenz-1963-v1',
    law: 'x_dot=sigma(y-x); y_dot=x(rho-z)-y; z_dot=xy-(8/3)z.',
    formal: flow('lorenz-1963-v1', ['x', 'y', 'z']),
    representation: 'governing-law-execution',
    runtimeKind: 'ode',
    executionProfile: 'rk4-lorenz',
    output: 'trajectory',
    objectKind: 'chaotic-attractor-candidate',
    primaryTruth:
      'A post-transient finite trajectory repeatedly visits two lobes in a bounded dissipative regime.',
    observableIds: ['x', 'y', 'z'],
    limitations: ['The displayed path is a finite orbit segment, not the exact attractor.'],
    capabilities: ['recurrence', 'empirical-measure', 'local-stability'],
    validations: ['step-halving', 'equilibrium-residual', 'reference-statistic'],
    reviewedMaturity: 'M2',
  }),
  stommel: definition({
    lawRef: 'stommel-two-box-reduced-v1',
    law: 'Two contrast variables coupled by a circulation proportional to their density contrast.',
    formal: flow('stommel-two-box-reduced-v1', ['temperature-contrast', 'salinity-contrast']),
    representation: 'reduced-model',
    runtimeKind: 'ode',
    executionProfile: 'rk4-explicit-reviewed',
    output: 'trajectory',
    objectKind: 'attractor',
    primaryTruth:
      'Competing thermal and freshwater forcing can support distinct circulation equilibria.',
    observableIds: ['temperature-contrast', 'salinity-contrast'],
    visualDomains: [
      [-1, 2],
      [-1, 2],
    ],
    limitations: ['Nondimensional two-box reduction.'],
    capabilities: ['local-stability', 'bifurcation'],
    validations: ['step-halving', 'equilibrium-residual'],
  }),
  daisyworld: definition({
    lawRef: 'daisyworld-two-species-v1',
    law: 'Two albedo populations grow under local-temperature-dependent fitness and shared bare area.',
    formal: flow('daisyworld-two-species-v1', ['dark-cover', 'light-cover']),
    representation: 'reduced-model',
    runtimeKind: 'ode',
    executionProfile: 'rk4-positive-population',
    output: 'trajectory',
    objectKind: 'attractor',
    primaryTruth:
      'Albedo-dependent growth can regulate the model temperature over a luminosity range.',
    observableIds: ['dark-cover', 'light-cover', 'temperature'],
    visualDomains: [
      [0, 1],
      [0, 1],
    ],
    limitations: ['Toy climate-biosphere feedback model.'],
    capabilities: ['bifurcation'],
    validations: ['step-halving', 'positivity', 'parameter-bounds'],
  }),
  'carbon-cycle': definition({
    lawRef: 'three-box-carbon-cycle-v1',
    law: 'A linear three-reservoir carbon exchange model with a declared finite emission pulse.',
    formal: flow('three-box-carbon-cycle-v1', ['atmosphere', 'ocean', 'biosphere'], {
      autonomous: false,
    }),
    representation: 'reduced-model',
    runtimeKind: 'ode',
    executionProfile: 'rk4-positive-reaction',
    output: 'trajectory',
    objectKind: 'flux',
    primaryTruth:
      'A finite atmospheric pulse is redistributed among reservoirs while total carbon follows the declared forcing.',
    observableIds: ['atmosphere', 'ocean', 'biosphere'],
    visualDomains: [
      [0, 60],
      [0, 60],
    ],
    limitations: ['Linear box model; not an Earth-system projection.'],
    capabilities: ['flux', 'conservation'],
    validations: ['step-halving', 'positivity', 'mass-balance'],
  }),
  'shallow-water': definition({
    lawRef: 'linear-rotating-shallow-water-v1',
    law: 'eta_t+H(u_x+v_y)=0; u_t-fv=-g eta_x; v_t+fu=-g eta_y on a periodic grid.',
    formal: fieldClass('linear-rotating-shallow-water-v1', ['surface-height', 'u', 'v']),
    representation: 'governing-law-execution',
    runtimeKind: 'field',
    executionProfile: 'finite-difference-cfl-shallow-water',
    output: 'field-trajectory',
    objectKind: 'coherent-structure',
    primaryTruth:
      'Gravity and rotation transport a height perturbation while discrete total mass remains controlled.',
    observableIds: ['mean-surface-height', 'rms-surface-height', 'linear-energy'],
    visualQuantityIds: ['surface-height'],
    visualDomains: [[-0.08, 0.08]],
    limitations: ['Linear, unforced, periodic shallow-water model.'],
    capabilities: ['coherent-structure', 'conservation', 'flux'],
    validations: [
      'cfl-condition',
      'grid-refinement',
      'mass-balance',
      'energy-residual',
      'boundary-residual',
    ],
    reviewedMaturity: 'M2',
  }),
  'budyko-sellers': definition({
    lawRef: 'budyko-sellers-equilibrium-v1',
    law: 'A zonally averaged diffusive energy-balance equilibrium with temperature-dependent albedo.',
    formal: fieldClass('budyko-sellers-equilibrium-v1', ['temperature'], 'no-flux', 1),
    representation: 'reduced-model',
    runtimeKind: 'field',
    executionProfile: 'finite-difference-ebm-relaxation',
    output: 'field-trajectory',
    objectKind: 'spatial-field',
    primaryTruth:
      'Meridional transport and ice-albedo feedback shape a zonal-mean equilibrium temperature profile.',
    observableIds: ['mean-temperature', 'ice-line-latitude'],
    visualQuantityIds: ['temperature'],
    visualDomains: [[-80, 40]],
    limitations: ['Reduced zonal-mean equilibrium model; relaxation time is model time.'],
    capabilities: ['bifurcation', 'interface'],
    validations: ['grid-refinement', 'equilibrium-residual', 'boundary-residual'],
  }),
  'restricted-three-body': definition({
    lawRef: 'cr3bp-rotating-frame-v1',
    law: 'Planar circular restricted three-body equations in the rotating frame; collision proximity is an explicit invalid event.',
    formal: flow('cr3bp-rotating-frame-v1', ['x', 'y', 'vx', 'vy']),
    representation: 'governing-law-execution',
    runtimeKind: 'ode',
    executionProfile: 'rk4-fixed-event-cr3bp',
    output: 'trajectory',
    objectKind: 'orbit-segment',
    primaryTruth:
      'A finite rotating-frame CR3BP orbit segment is shown with its Jacobi value; conservation certification remains a separate check.',
    observableIds: ['x', 'y', 'jacobi'],
    visualDomains: [
      [-2, 2],
      [-2, 2],
    ],
    limitations: ['Finite planar restricted model.'],
    capabilities: ['conservation', 'recurrence'],
    validations: ['step-halving', 'energy-residual'],
  }),
  kepler: definition({
    lawRef: 'kepler-elliptic-time-law-v1',
    law: 'Elliptic two-body orbit sampled uniformly in mean anomaly by solving Kepler equation M=E-e sin E.',
    formal: flow('kepler-elliptic-time-law-v1', ['x', 'y', 'vx', 'vy']),
    representation: 'closed-form-solution',
    runtimeKind: 'analytic',
    executionProfile: 'kepler-equation-newton',
    output: 'trajectory',
    objectKind: 'periodic-orbit',
    primaryTruth:
      'Equal time intervals sweep equal areas, producing nonuniform orbital speed on an ellipse.',
    observableIds: ['x', 'y', 'radius', 'swept-area'],
    visualDomains: [
      [-2, 2],
      [-2, 2],
    ],
    limitations: ['Bound elliptic two-body orbit in normalized units.'],
    capabilities: ['conservation', 'frequency'],
    validations: ['energy-residual', 'reference-statistic'],
    reviewedMaturity: 'M2',
  }),
  hohmann: definition({
    lawRef: 'hohmann-two-impulse-v1',
    law: 'Two circular orbits joined by a tangent Keplerian transfer ellipse with two instantaneous impulses.',
    formal: {
      ...flow('hohmann-two-impulse-v1', ['x', 'y', 'vx', 'vy'], { autonomous: false }),
      character: 'hybrid',
    },
    representation: 'closed-form-solution',
    runtimeKind: 'hybrid',
    executionProfile: 'analytic-hohmann-events',
    output: 'trajectory',
    objectKind: 'orbit-segment',
    primaryTruth:
      'Two impulses connect circular orbits through one tangent half-ellipse with continuous position.',
    observableIds: ['x', 'y', 'radius', 'delta-v'],
    visualDomains: [
      [-3, 3],
      [-3, 3],
    ],
    limitations: ['Ideal impulsive coplanar transfer.'],
    capabilities: ['flux'],
    validations: ['dimension-consistency', 'reference-statistic'],
    reviewedMaturity: 'M2',
  }),
  'n-body': definition({
    lawRef: 'newtonian-three-body-softening-v1',
    law: 'Planar Newtonian three-body gravity with an explicitly declared Plummer softening length.',
    formal: flow('newtonian-three-body-softening-v1', [
      'body-a-x',
      'body-a-y',
      'body-b-x',
      'body-b-y',
      'body-c-x',
      'body-c-y',
      'body-a-vx',
      'body-a-vy',
      'body-b-vx',
      'body-b-vy',
      'body-c-vx',
      'body-c-vy',
    ]),
    representation: 'governing-law-execution',
    runtimeKind: 'ode',
    executionProfile: 'rk4-fixed-softened-nbody',
    output: 'trajectory',
    objectKind: 'orbit-segment',
    primaryTruth:
      'Declared Plummer-softened mutual gravity produces a finite planar orbit segment.',
    observableIds: ['body-a-x', 'body-a-y', 'body-b-x', 'body-b-y', 'body-c-x', 'body-c-y'],
    visualDomains: [
      [-4, 4],
      [-4, 4],
    ],
    limitations: [
      'Planar three-body model with declared softening; not point-mass collision physics.',
    ],
    capabilities: [],
    validations: ['step-halving'],
  }),
  friedmann: definition({
    lawRef: 'friedmann-expanding-branch-v1',
    law: '(da/dtau)^2 = Omega_m/a + Omega_k + Omega_Lambda a^2; forbidden radicand and turnaround are explicit events.',
    formal: flow('friedmann-expanding-branch-v1', ['scale-factor']),
    representation: 'governing-law-execution',
    runtimeKind: 'ode',
    executionProfile: 'rk4-fixed-invalid-on-turnaround-friedmann',
    output: 'trajectory',
    objectKind: 'transient-segment',
    primaryTruth:
      'Matter, curvature, and vacuum density determine the expanding branch until a physical turnaround or invalid regime.',
    observableIds: ['scale-factor', 'hubble-rate'],
    visualDomains: [
      [0, 20],
      [0, 50],
    ],
    limitations: ['Homogeneous background dynamics in normalized units.'],
    capabilities: ['bifurcation'],
    validations: ['step-halving', 'reference-statistic'],
  }),
  'exoplanet-transit': definition({
    lawRef: 'uniform-disk-transit-v1',
    law: 'Exact overlap area of two disks along a straight projected chord, normalized to stellar flux.',
    formal: flow('uniform-disk-transit-v1', ['x', 'y'], {
      autonomous: false,
    }),
    representation: 'closed-form-solution',
    runtimeKind: 'analytic',
    executionProfile: 'analytic-disk-overlap',
    output: 'trajectory',
    objectKind: 'transient-segment',
    primaryTruth:
      'Projected overlap geometry converts planet radius and impact parameter into a transit light curve.',
    observableIds: ['phase', 'flux', 'overlap-area'],
    visualDomains: [
      [-1, 1],
      [0.93, 1],
    ],
    limitations: ['Uniform stellar disk; limb darkening is not claimed.'],
    capabilities: ['uncertainty'],
    validations: ['reference-statistic'],
    reviewedMaturity: 'M2',
  }),
} satisfies Record<string, PortraitDefinition>;

export type BuiltInKernelId = keyof typeof portraitDefinitions;

function regimeValues(parameters: WorkParameter[], preset: WorkPreset) {
  const values = Object.fromEntries(parameters.map((item) => [item.id, item.default]));
  return { ...values, ...preset.values };
}

function defaultMapping(
  render: RenderKind,
  objectId: string,
  regimeIds: string[],
  observableIds: string[],
  domains: Array<readonly [number, number]> = [],
): SemanticVisualLayer[] {
  if (render === 'field') {
    return [
      {
        id: `${objectId}-field`,
        objectId,
        appliesToRegimeIds: regimeIds,
        mark: 'field-raster' as const,
        bindings: [
          {
            quantityRef: observableIds[0] ?? 'field',
            channel: 'luminance' as const,
            scale: 'linear' as const,
            domain: domains[0] ?? ([0, 1] as const),
            outOfDomain: 'overflow-indicator' as const,
          },
        ],
        scientificTime: {
          quantityRef: 'simulation-time',
          mode: 'frame' as const,
          interpolation: 'linear' as const,
        },
        reducedMotion: {
          strategy: 'keyframes' as const,
          dataRef: 'representative-field-frames',
          preserves: ['spatial field values', 'declared color scale'],
        },
      },
    ];
  }
  return [
    {
      id: `${objectId}-primary`,
      objectId,
      appliesToRegimeIds: regimeIds,
      mark: 'path' as const,
      bindings: [
        {
          quantityRef: observableIds[0] ?? 'observable-1',
          channel: 'position-x' as const,
          scale: 'linear' as const,
          domain: domains[0] ?? ([-1, 1] as const),
          outOfDomain: 'overflow-indicator' as const,
        },
        {
          quantityRef: observableIds[1] ?? observableIds[0] ?? 'observable-1',
          channel: 'position-y' as const,
          scale: 'linear' as const,
          domain: domains[1] ?? domains[0] ?? ([-1, 1] as const),
          outOfDomain: 'overflow-indicator' as const,
        },
      ],
      projection: {
        coordinateRefs: observableIds.slice(0, 2),
        method: 'selected-coordinates' as const,
        aspect:
          render === 'orbit' || render === 'phase'
            ? ('equal-data-units' as const)
            : ('declared-distortion' as const),
      },
      scientificTime: {
        quantityRef: 'simulation-time',
        mode: 'cursor' as const,
        interpolation: 'linear' as const,
      },
      reducedMotion: {
        strategy: 'accumulated-density' as const,
        preserves: ['trajectory support', 'fixed projection'],
      },
    },
  ];
}

function reviewedMappings(
  kernel: string,
  render: RenderKind,
  objectId: string,
  regimeIds: string[],
  observableIds: string[],
  domains: Array<readonly [number, number]>,
): SemanticVisualLayer[] {
  const reducedMotion = {
    strategy: 'semantic-static' as const,
    preserves: ['current scientific state', 'numeric evidence', 'fixed visual encoding'],
  };
  if (kernel === 'lorenz') {
    return [
      {
        id: `${objectId}-xz-orbit`,
        objectId,
        appliesToRegimeIds: regimeIds,
        mark: 'path',
        bindings: [
          {
            quantityRef: 'x',
            channel: 'position-x',
            scale: 'linear',
            domain: [-24, 24],
            outOfDomain: 'overflow-indicator',
          },
          {
            quantityRef: 'z',
            channel: 'position-y',
            scale: 'linear',
            domain: [0, 50],
            outOfDomain: 'overflow-indicator',
          },
        ],
        projection: {
          coordinateRefs: ['x', 'z'],
          method: 'selected-coordinates',
          aspect: 'equal-data-units',
        },
        scientificTime: {
          quantityRef: 'simulation-time',
          mode: 'cursor',
          interpolation: 'linear',
        },
        reducedMotion: {
          strategy: 'accumulated-density',
          dataRef: 'post-burn-in-xz-occupancy',
          preserves: ['two-lobe support', 'fixed x-z projection'],
        },
      },
    ];
  }
  if (kernel === 'reaction-chain') {
    return [
      ...['a', 'b', 'c', 'collected'].map((quantityRef): SemanticVisualLayer => ({
        id: `${objectId}-${quantityRef.toLowerCase()}-quantity`,
        objectId,
        appliesToRegimeIds: regimeIds,
        mark: 'fill',
        bindings: [
          {
            quantityRef,
            channel: 'area',
            scale: 'linear',
            domain: quantityRef === 'collected' ? [0, 120] : [0, 55],
            zero: 0,
            outOfDomain: 'overflow-indicator',
          },
        ],
        scientificTime: {
          quantityRef: 'simulation-time',
          mode: 'frame',
          interpolation: 'linear',
        },
        reducedMotion,
      })),
      ...['a-to-b-flux', 'b-to-c-flux', 'c-to-collected-flux'].map(
        (quantityRef): SemanticVisualLayer => ({
          id: `${objectId}-${quantityRef}`,
          objectId,
          appliesToRegimeIds: regimeIds,
          mark: 'particle',
          bindings: [
            {
              quantityRef,
              channel: 'stroke-width',
              scale: 'sqrt',
              domain: [0, 2.5],
              zero: 0,
              outOfDomain: 'overflow-indicator',
            },
            {
              quantityRef,
              channel: 'direction',
              scale: 'categorical',
              domain: ['forward'],
              outOfDomain: 'overflow-indicator',
            },
            {
              quantityRef,
              channel: 'event-frequency',
              scale: 'linear',
              domain: [0, 2.5],
              zero: 0,
              eventQuantum: 0.25,
              eventAccumulatorRef: quantityRef.replace('-flux', '-cumulative'),
              outOfDomain: 'overflow-indicator',
            },
          ],
          scientificTime: {
            quantityRef: 'simulation-time',
            mode: 'frame',
            interpolation: 'linear',
          },
          reducedMotion,
        }),
      ),
    ];
  }
  if (kernel === 'kuramoto') {
    return [
      {
        id: `${objectId}-phase-circle`,
        objectId,
        appliesToRegimeIds: regimeIds,
        mark: 'glyph',
        bindings: [
          ...Array.from({ length: 12 }, (_, index) => ({
            quantityRef: `theta-${index + 1}`,
            channel: 'phase' as const,
            scale: 'cyclic' as const,
            domain: [0, Math.PI * 2] as const,
            outOfDomain: 'wrap-cyclic' as const,
          })),
          {
            quantityRef: 'order-real',
            channel: 'position-x',
            scale: 'linear',
            domain: [-1, 1],
            zero: 0,
            outOfDomain: 'overflow-indicator',
          },
          {
            quantityRef: 'order-imaginary',
            channel: 'position-y',
            scale: 'linear',
            domain: [-1, 1],
            zero: 0,
            outOfDomain: 'overflow-indicator',
          },
          {
            quantityRef: 'coherence',
            channel: 'area',
            scale: 'linear',
            domain: [0, 1],
            zero: 0,
            outOfDomain: 'overflow-indicator',
          },
        ],
        scientificTime: {
          quantityRef: 'simulation-time',
          mode: 'frame',
          interpolation: 'linear',
        },
        reducedMotion,
      },
    ];
  }
  if (kernel === 'fput') {
    return [
      {
        id: `${objectId}-modal-energy`,
        objectId,
        appliesToRegimeIds: regimeIds,
        mark: 'fill',
        bindings: [
          ...[1, 2, 3, 4].map((mode) => ({
            quantityRef: `mode-${mode}-harmonic-energy`,
            channel: 'area' as const,
            scale: 'linear' as const,
            domain: [0, 1] as const,
            zero: 0,
            outOfDomain: 'overflow-indicator' as const,
          })),
        ],
        scientificTime: {
          quantityRef: 'simulation-time',
          mode: 'frame',
          interpolation: 'linear',
        },
        reducedMotion,
      },
    ];
  }
  return defaultMapping(render, objectId, regimeIds, observableIds, domains);
}

export function createPortraitExtension(input: {
  slug: string;
  kernel: string;
  render: RenderKind;
  parameters: WorkParameter[];
  presets: WorkPreset[];
}): PortraitManifestExtension {
  const reviewed = portraitDefinitions[input.kernel as BuiltInKernelId];
  if (!reviewed) throw new Error(`No reviewed portrait definition for kernel ${input.kernel}.`);
  const parameterRegimes = input.presets.map((preset) => {
    const values = regimeValues(input.parameters, preset);
    return {
      id: `${input.slug}-${preset.id}`,
      presetIds: [preset.id],
      parameterDomain: Object.fromEntries(
        Object.entries(values).map(([id, value]) => [id, [value, value] as const]),
      ),
      note: `Reviewed ${preset.label.toLowerCase()} parameter point.`,
    };
  });
  const regimeIds = parameterRegimes.map((regime) => regime.id);
  const objectId = `${input.slug}-primary-object`;
  const definitionHash = hashCanonical({
    lawRef: reviewed.lawRef,
    law: reviewed.law,
    formal: reviewed.formal,
  });
  const visualMappings = reviewedMappings(
    input.kernel,
    input.render,
    objectId,
    regimeIds,
    reviewed.visualQuantityIds ?? reviewed.observableIds,
    reviewed.visualDomains ?? [],
  );
  return {
    formal: reviewed.formal,
    definition: {
      definitionRef: reviewed.lawRef,
      expectedHash: definitionHash,
      explanation: reviewed.law,
    },
    parameterRegimes,
    primaryClaims: [
      {
        id: `${input.slug}-primary-claim`,
        appliesToRegimeIds: regimeIds,
        statement: reviewed.primaryTruth,
        objectKind: reviewed.objectKind,
        observableIds: reviewed.observableIds,
        limitations: reviewed.limitations,
        targetMaturity: reviewed.reviewedMaturity,
      },
    ],
    science: {
      representation: reviewed.representation,
      capabilities: reviewed.capabilities,
      validations: reviewed.validations,
      reviewedMaturity: reviewed.reviewedMaturity,
    },
    runtime: {
      kind: reviewed.runtimeKind,
      kernel: input.kernel,
      definitionRef: reviewed.lawRef,
      definitionHash,
      executionProfile: reviewed.executionProfile,
      output: reviewed.output,
    },
    visualMappings,
    composition: {
      layerIds: visualMappings.map((layer) => layer.id),
      focalLayerId: visualMappings[0]?.id ?? objectId,
      negativeSpace: 0.28,
      camera: 'none',
      atmosphere: { assetRef: 'museum-ambient', nonSemantic: true, ariaHidden: true },
    },
  };
}
