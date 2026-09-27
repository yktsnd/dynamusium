import type { WorkLearningGuide } from './types.ts';

/** Short, work-specific invitations to observe and test the museum's 30 models. */
export const learningGuides: Record<string, WorkLearningGuide> = {
  'double-pendulum': {
    observe: 'Watch how the lower arm changes direction as the upper arm swings.',
    experiment: 'Compare the narrow and wide release. Look for when their motions first separate.',
    connect:
      'The two arms exchange energy through their shared joint; nearby starts need not keep nearby paths.',
    presets: { quiet: 'Narrow release', threshold: 'Wide release' },
  },
  'kuramoto-oscillators': {
    observe: 'Follow the phases around the circle and the length of their shared order vector.',
    experiment: 'Switch between weak and stronger coupling. Notice whether the phases gather.',
    connect:
      'Each oscillator responds to the phase differences of the others; coupling competes with their natural frequency spread.',
    presets: { quiet: 'Weak coupling', threshold: 'Stronger coupling' },
  },
  'fput-chain': {
    observe: 'Track energy leaving the first mode and watch for its return.',
    experiment:
      'Compare low and high nonlinearity. Does the energy stay spread out or revisit its starting mode?',
    connect:
      'Neighboring masses exchange energy through nonlinear springs, so mode energy need not mix quickly.',
    presets: { quiet: 'Low nonlinearity', threshold: 'High nonlinearity' },
  },
  'logistic-map': {
    observe:
      'Read the points in iteration order; each point is the next value of the population fraction.',
    experiment:
      'Compare the periodic setting with the setting near period doubling. Count distinct values after the transient.',
    connect:
      'A deterministic update rule can repeat, split into cycles, or become sensitive as its growth parameter changes.',
    presets: { quiet: 'Periodic cycle', threshold: 'Near period doubling' },
  },
  'wave-equation': {
    observe:
      'Watch a localized displacement travel across the string without moving the whole string with it.',
    experiment:
      'Compare the broad and fine initial shapes. Notice how their spatial scales travel.',
    connect:
      'The wave equation couples the rate of change in time to curvature in space, carrying shape at a finite speed.',
    presets: { quiet: 'Broad initial shape', threshold: 'Fine initial shape' },
  },
  'standard-map': {
    observe: 'Separate the islands of regular motion from the surrounding scattered points.',
    experiment:
      'Compare weak and stronger kicks. Watch which islands persist and where points spread.',
    connect: 'A repeated area-preserving map can contain regular and chaotic regions side by side.',
    presets: { quiet: 'Weak kick', threshold: 'Strong kick' },
  },
  'fed-reaction-chain': {
    observe:
      'Compare the amount in each vessel with the signed flow along the connecting channels.',
    experiment: 'Change the feed and trace how its effect passes through the chain over time.',
    connect:
      'Material changes amount only through inflow and outflow; channel width and particle frequency encode different quantities.',
    presets: { quiet: 'Steady feed', threshold: 'Pulse response' },
  },
  'gray-scott': {
    observe: 'Follow where the V field brightens and how spots grow, split, or fade.',
    experiment:
      'Compare the two feed/kill settings. Keep the displayed color scale fixed while patterns evolve.',
    connect:
      'Two reacting chemicals diffuse across the grid; local reaction and spatial transport together shape the pattern.',
    presets: { quiet: 'Diffuse spots', threshold: 'Dense spots' },
  },
  'heat-diffusion': {
    observe: 'Watch sharp temperature differences smooth out across the domain.',
    experiment: 'Compare the initial modes. Which starting shape loses its fine detail sooner?',
    connect:
      'Diffusion acts more quickly on short spatial wavelengths, so small-scale variation fades first.',
    presets: { quiet: 'Broad initial shape', threshold: 'Fine initial shape' },
  },
  'schrodinger-wave-packet': {
    observe: 'Read brightness as probability density and follow the packet as it spreads.',
    experiment: 'Compare narrow and broad initial packets. Watch how their spatial widths change.',
    connect:
      'The wavefunction carries phase and amplitude; its squared magnitude gives the displayed probability density.',
    presets: { quiet: 'Broad packet', threshold: 'Narrow packet' },
  },
  'ising-model': {
    observe: 'Look for clusters of aligned spins and the moment when large domains appear.',
    experiment:
      'Compare low temperature with the setting nearer the transition. Notice how ordered regions change.',
    connect:
      'Neighbor interactions favor alignment while thermal sampling creates competing disorder.',
    presets: { quiet: 'High temperature', threshold: 'Near transition' },
  },
  'cahn-hilliard': {
    observe: 'Follow the boundaries between rich and poor regions as domains coarsen.',
    experiment:
      'Compare slower and faster separation. Check that the total composition remains nearly fixed.',
    connect:
      'The model conserves total composition while gradients in chemical potential drive material between regions.',
    presets: { quiet: 'Slow separation', threshold: 'Fast separation' },
  },
  'lotka-volterra': {
    observe: 'Compare the prey and predator peaks. One population rises after the other changes.',
    experiment:
      'Lower and raise predation. Watch how the orbit and the timing between peaks respond.',
    connect:
      'Predators grow when prey are available, while predation removes prey; that coupling creates delayed cycles.',
    presets: { quiet: 'Low predation', threshold: 'High predation' },
  },
  brusselator: {
    observe: 'Watch the phase point settle or circle around the steady chemical state.',
    experiment:
      'Compare feed B below and above the onset used in this model. Does a sustained cycle appear?',
    connect:
      'An open reaction network can lose a stable fixed point as feed changes and develop a repeating chemical rhythm.',
    presets: { quiet: 'Stable state', threshold: 'Oscillating state' },
  },
  oregonator: {
    observe: 'Notice the long buildup followed by a sharp pulse in the reaction variables.',
    experiment: 'Compare the slower and faster settings. Watch how pulse width and spacing change.',
    connect:
      'Separated fast and slow reaction timescales create relaxation oscillations in this reduced mechanism.',
    presets: { quiet: 'Slow timescale', threshold: 'Fast pulses' },
  },
  'sir-epidemic': {
    observe: 'Track susceptible, infectious, and removed groups; the infectious curve peaks once.',
    experiment:
      'Compare lower and higher transmission. Watch the peak and the final susceptible fraction.',
    connect:
      'Infections grow when transmission among susceptible people exceeds removal; this simple model omits many real-world differences.',
    presets: { quiet: 'Limited spread', threshold: 'Larger outbreak' },
  },
  'hodgkin-huxley': {
    observe: 'Compare the applied current with the voltage trace and the timing of each spike.',
    experiment:
      'Move from lower drive to stronger drive. Look for the change from no spike to repeated firing.',
    connect:
      'Voltage-dependent sodium and potassium gates turn continuous membrane current into action potentials.',
    presets: { quiet: 'Below spike onset', threshold: 'Repeated firing' },
  },
  'fitzhugh-nagumo': {
    observe:
      'Follow the fast voltage-like variable and the slower recovery variable around the phase portrait.',
    experiment:
      'Compare subthreshold and stronger drive. Look for a full excursion before recovery.',
    connect:
      'This reduced model keeps the geometry of excitation while simplifying the detailed ion-channel mechanisms.',
    presets: { quiet: 'Subthreshold drive', threshold: 'Excitable drive' },
  },
  'lorenz-atmosphere': {
    observe: 'Watch the orbit switch between lobes; the path is a finite computed segment.',
    experiment:
      'Compare the steady setting with the setting near the transition. Then change the initial state slightly to test predictability.',
    connect:
      'The three equations are a simplified convection model. Deterministic rules can still amplify small initial differences.',
    presets: { quiet: 'Steady regime', threshold: 'Near transition' },
  },
  'stommel-box': {
    observe: 'Follow temperature, salinity, and the sign of the overturning flow.',
    experiment:
      'Compare weaker and stronger freshwater forcing. Check whether the same setting can support a different state.',
    connect:
      'Temperature and salinity affect density together, allowing feedback to support more than one circulation regime.',
    presets: { quiet: 'Weak freshwater input', threshold: 'Strong freshwater input' },
  },
  daisyworld: {
    observe: 'Compare dark and light daisy cover with the planet’s temperature.',
    experiment:
      'Change stellar luminosity from dimmer to brighter. Watch where each population grows or declines.',
    connect:
      'Surface color changes absorbed light, coupling ecological competition to planetary temperature without foresight.',
    presets: { quiet: 'Dimmer star', threshold: 'Brighter star' },
  },
  'carbon-cycle': {
    observe: 'Follow the emission pulse into the atmosphere, ocean, and biosphere boxes.',
    experiment:
      'Compare smaller and larger pulses. Notice what remains in the atmosphere after the source stops.',
    connect:
      'Exchange among reservoirs occurs on different timescales, so a short input can leave a long response.',
    presets: { quiet: 'Small pulse', threshold: 'Large pulse' },
  },
  'shallow-water': {
    observe:
      'Watch the surface height and velocity fields travel and interact across the periodic domain.',
    experiment:
      'Compare the depth and rotation settings. Look for changes in the wave pattern and speed.',
    connect:
      'Depth-averaged equations preserve selected wave dynamics while replacing the full vertical ocean structure.',
    presets: { quiet: 'Shallow, slowly rotating', threshold: 'Deep, rapidly rotating' },
  },
  'budyko-sellers': {
    observe: 'Locate the ice edge and follow how the temperature field changes with latitude.',
    experiment:
      'Compare warmer and cooler solar forcing. Look for gradual edge motion and any abrupt shift.',
    connect:
      'Ice changes reflectivity, feeding back on absorbed sunlight and allowing multiple climate states in this reduced model.',
    presets: { quiet: 'Warmer forcing', threshold: 'Cooler forcing' },
  },
  'restricted-three-body': {
    observe: 'Follow the small body in the rotating frame shaped by the two larger masses.',
    experiment:
      'Compare lower and higher launch speeds. Watch for bounded motion or a close encounter.',
    connect:
      'The two primaries shape one shared gravitational landscape; the small body does not move around a single fixed center.',
    presets: { quiet: 'Lower launch speed', threshold: 'Higher launch speed' },
  },
  'kepler-orbit': {
    observe: 'Track the radius vector and compare how far it sweeps during equal time intervals.',
    experiment:
      'Compare nearly circular and eccentric orbits. Notice where orbital speed is greatest.',
    connect:
      'For a central force, conserved angular momentum links faster motion near periapsis with equal swept areas in equal times.',
    presets: { quiet: 'Nearly circular', threshold: 'Eccentric orbit' },
  },
  'hohmann-transfer': {
    observe:
      'Follow the transfer ellipse between the two circular orbits and locate each velocity change.',
    experiment:
      'Compare nearby and distant target orbits. Watch how the transfer path and required velocity changes respond.',
    connect:
      'The two-impulse transfer is efficient for circular coplanar orbits under idealized two-body assumptions.',
    presets: { quiet: 'Nearby target', threshold: 'Distant target' },
  },
  'n-body-system': {
    observe: 'Track all bodies together; each orbit changes as every mass pulls on the others.',
    experiment:
      'Change the third body’s mass. Watch how the shared paths and energy exchange change.',
    connect:
      'Pairwise gravity couples every body. Total energy and momentum describe the system even when individual orbits shift.',
    presets: { quiet: 'Light third body', threshold: 'Massive third body' },
  },
  'friedmann-lemaitre': {
    observe:
      'Follow the scale factor through time and compare expansion with the changing density terms.',
    experiment:
      'Compare matter-rich and vacuum-rich settings. Notice when the expansion rate changes most.',
    connect:
      'The Friedmann equation relates expansion to the model’s matter, curvature, and vacuum-energy inventory.',
    presets: { quiet: 'Matter dominated', threshold: 'Vacuum dominated' },
  },
  'exoplanet-transit': {
    observe:
      'Compare the planet’s projected position with the dip in the star’s measured brightness.',
    experiment: 'Compare smaller and larger planets, then vary the transit path across the star.',
    connect:
      'The dip measures blocked projected area; the inference depends on geometry and the model’s uniform-brightness assumption.',
    presets: { quiet: 'Small planet', threshold: 'Large planet' },
  },
};
