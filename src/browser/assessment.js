// Replace assessBuilding with the team's engine when ready. No reference labels,
// fabricated radiator ratings, probabilistic confidence, or AI are used here.
export const ENGINE_VERSION = 'browser-preview-0.1';

export function toEngineInput(values) {
  const excluded = new Set(['reference_heating_load_kw', 'expected_verdict', 'dev_check']);
  const fields = Object.fromEntries(Object.entries(values).filter(([key]) => !excluded.has(key) && key !== 'building_id').map(([key, value]) => [key, {
    value: value === 'unknown' || value === '' || value === undefined ? null : value,
    source: 'homeowner.confirmed',
    confidence: null,
    evidence: value === null || value === undefined || value === '' || value === 'unknown' ? 'Not provided' : String(value)
  }]));
  return { schema_version: '0.1', building_id: values.building_id || 'HOME', raw_inputs: [], fields };
}

export function assessBuilding(input) {
  const v = Object.fromEntries(Object.entries(input.fields || {}).map(([k, f]) => [k, f.value]));
  const positive = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
  const reasons = [], missing = [], assumptions = [], homeowner = [];
  const add = (type, text, source) => reasons.push({ type, text, source });
  let byArea = null, byConsumption = null, current = null, hp = null;
  const fossil = ['gas', 'oil', 'lpg'].includes(v.energy_carrier);
  const year = v.construction_year;
  if (positive(v.floor_area_m2)) {
    let band;
    if (v.renovation_status === 'fully') band = [40, 60];
    else if (positive(year) && year >= 2002) band = [40, 60];
    else if (positive(year) && year < 1979 && v.renovation_status === 'unrenovated') band = [120, 180];
    else if (positive(year) && year >= 1980 && year <= 1999 && v.renovation_status !== 'partially') band = [80, 120];
    if (band) {
      byArea = band.map(n => n * v.floor_area_m2 / 1000);
      assumptions.push(`Age/renovation estimate uses ${band[0]}–${band[1]} W/m² from the challenge guidance. This is a broad reference band.`);
    } else {
      missing.push('A suitable age/renovation reference for this home. The supplied table has gaps and no partial-renovation category.');
    }
  } else missing.push('Heated floor area, to estimate demand from the size of your home.');

  const validEnergy = positive(v.annual_consumption_kwh) && v.consumption_full_year === true && fossil;
  if (validEnergy) {
    const useful = v.annual_consumption_kwh * 0.88;
    assumptions.push('The boiler supplies useful heat equal to 88% of the fuel energy. Heat load uses approximately 2,000 full-load hours per year.');
    if (v.hot_water_via_heating === false) byConsumption = [useful / 2000, useful / 2000];
    else if (positive(v.persons_in_household)) {
      const water = 1000 * v.persons_in_household;
      if (water < useful) {
        byConsumption = [(useful - water) / 2000, (v.hot_water_via_heating === true && v.solar_thermal === false ? useful - water : useful) / 2000];
        assumptions.push('Hot water allowance: up to 1,000 kWh per person per year. The range keeps uncertainty about solar hot water or the hot-water supply visible.');
      } else add('unknown', 'The hot-water allowance is larger than the useful heat in this bill. Please check the amount, unit and billing period.', 'annual_consumption_kwh');
    } else missing.push('Number of people, or confirmation that hot water is heated separately, to separate space heating from hot water.');
    const prices = { gas: 0.11, oil: 0.17 };
    if (prices[v.energy_carrier]) current = v.annual_consumption_kwh * prices[v.energy_carrier];
    if (v.energy_carrier === 'lpg') missing.push('An LPG price. The challenge gives a natural-gas price, which is not automatically an LPG price.');
    let efficiencies;
    if (positive(v.flow_temperature_c) && v.flow_temperature_c > 60) {
      add('unknown', 'The water temperature you entered is above 60 °C. A technician should check whether lower-temperature operation is possible.', 'flow_temperature_c');
    } else if (v.heat_distribution === 'underfloor') efficiencies = [4, 4];
    else if (v.heat_distribution === 'radiators') efficiencies = positive(v.flow_temperature_c) ? (v.flow_temperature_c <= 55 ? [3.5, 3.5] : [2.8, 2.8]) : [2.8, 3.5];
    else if (v.heat_distribution === 'mixed') efficiencies = [2.8, 4];
    if (efficiencies) {
      hp = [useful / efficiencies[1] * 0.26, useful / efficiencies[0] * 0.26];
      assumptions.push(`Cost scenarios use €0.26/kWh electricity and seasonal efficiency ${efficiencies[0]}${efficiencies[0] !== efficiencies[1] ? '–' + efficiencies[1] : ''}. They are conditional, not a forecast of measured performance.`);
    }
  } else if (positive(v.annual_consumption_kwh) && v.consumption_full_year !== true) {
    missing.push('A full year of energy consumption. We have not treated your partial or uncertain billing period as a full year.');
  } else if (!positive(v.annual_consumption_kwh)) missing.push('Annual energy consumption from a recent full-year heating bill.');
  else missing.push('A method for your current energy source. This preview only applies the boiler assumption to gas, LPG and oil.');

  if (v.heat_distribution === 'underfloor') add('positive', 'Underfloor heating is a promising starting point because it usually works with lower water temperatures.', 'heat_distribution');
  else if (v.heat_distribution === 'mixed') add('unknown', 'Your floor heating and radiators may need different water temperatures. Both heating circuits need to be checked.', 'heat_distribution');
  else if (v.heat_distribution === 'radiators') add('hint', 'Having radiators does not rule out a heat pump. Their size and the water temperature they need are what matter.', 'heat_distribution');
  else missing.push('Whether your home uses radiators, underfloor heating, or both.');
  if (v.pipe_system === 'single-pipe') add('action', 'Your single-pipe heating loop needs a professional check. It may need balancing or changes to work efficiently at lower temperatures.', 'pipe_system');
  if (v.pipe_system === 'two-pipe') add('positive', 'A two-pipe heating system is a helpful starting point for supplying the radiators.', 'pipe_system');
  if (['radiators', 'mixed'].includes(v.heat_distribution) && !positive(v.flow_temperature_c)) {
    homeowner.push('If you already know it, add the heating water temperature used on a cold day. You do not need to change any boiler settings.');
  }
  if (v.other_heat_source === true) add('unknown', 'You use another heat source. Your bill does not include all of its heat, so it cannot tell us the total demand a heat pump would need to cover.', 'other_heat_source');
  if (v.solar_thermal === true) add('unknown', 'Solar hot water changes how much of the bill is used for hot water. We have kept this uncertainty in the estimate.', 'solar_thermal');
  if (v.building_notes) add('hint', 'Your additional notes are included in the handoff. A technician should review them; this preview does not automatically interpret free text.', 'building_notes');
  const consistent = byArea && byConsumption ? Math.max(byArea[0], byConsumption[0]) <= Math.min(byArea[1], byConsumption[1]) : null;
  if (consistent === false) {
    add('unknown', 'The size-and-age estimate and the bill estimate do not overlap. Check the heated area, billing period and any extra heat sources before sizing a heat pump.', 'heating_load_kw');
    homeowner.unshift('Does the bill cover all the rooms you want to heat, and do you also use a stove or another heat source?');
  }
  const green = v.heat_distribution === 'underfloor' && Boolean(byArea || byConsumption) && v.pipe_system !== 'single-pipe' && !(positive(v.flow_temperature_c) && v.flow_temperature_c > 55);
  const enough = Boolean(byArea || byConsumption);
  const verdict = green ? 'green' : 'yellow';
  const summary = green ? 'Your home has a promising starting point for a heat pump. A technician still needs to confirm the sizing and installation details.' : enough ? 'A heat pump may work for your home. A few important checks are needed before we can give a clearer answer.' : 'We need a little more information to give you a useful first answer. This does not mean your home is unsuitable.';
  return {
    schema_version: '0.1', engine_version: ENGINE_VERSION, building_id: input.building_id,
    verdict, verdict_kind: green ? 'promising' : 'unknown', summary,
    heating_load_kw: { by_area: byArea, by_consumption: byConsumption, consistent, used: null },
    cost_eur_per_year: { today: current, heat_pump: hp, saving: null, note: 'Conditional annual energy costs using the challenge prices. The same boiler-supplied heat, including hot water if present, is compared. Other heat sources, installation, standing charges and maintenance are excluded. The efficiency of a mixed or single-pipe system has not been verified.' },
    reasons, missing_information: missing, homeowner_can_provide: homeowner,
    technician_checks: ['Confirm the heat needed in each room and the correct heat pump size.', 'Check radiator capacity, heating water temperature and pipe layout.', 'Check electrical capacity and a suitable outdoor-unit location.'],
    assumptions
  };
}
