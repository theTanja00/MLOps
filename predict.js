let modelData = null;
const MODEL_FILE = 'mode.json';

const STATE_CODE_MAP = { CA: 1, NY: 2, OTHER: 0 };

const NUMERIC_FEATURE_FIELDS = [
  ['age_first_funding_year', 'age_first_funding_year'],
  ['age_last_funding_year', 'age_last_funding_year'],
  ['age_first_milestone_year', 'age_first_milestone_year'],
  ['age_last_milestone_year', 'age_last_milestone_year'],
  ['relationships', 'relationships'],
  ['funding_rounds', 'funding_rounds'],
  ['funding_total_usd', 'funding_total_usd'],
  ['milestones', 'milestones'],
  ['founding_year', 'founding_year'],
  ['first_funding_year', 'first_funding_year'],
  ['last_funding_year', 'last_funding_year']
];

const BOOLEAN_FEATURE_FIELDS = [
  ['has_Investor', 'has_Investor'],
  ['is_mountain_view', 'is_Mountain View'],
  ['is_new_york', 'is_New York'],
  ['is_palo_alto', 'is_Palo Alto'],
  ['is_san_francisco', 'is_San Francisco'],
  ['is_santa_clara', 'is_Santa Clara'],
  ['is_other', 'is_other']
];

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function boolToInt(value) {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (typeof value === 'number') {
    return value !== 0 ? 1 : 0;
  }
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' ? 1 : 0;
}

function canonicalFeatureName(name) {
  return String(name ?? '').toLowerCase().replace(/[ _]/g, '');
}

function getElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error('UI-Feld nicht gefunden: ' + id);
  }
  return element;
}

function normalizedStateToNumber(rawStateCode) {
  const normalized = String(rawStateCode ?? '').trim().toUpperCase();
  return STATE_CODE_MAP[normalized] ?? STATE_CODE_MAP.OTHER;
}

function buildFeatureMapFromUI() {
  const featureMap = {};

  featureMap[canonicalFeatureName('state_code')] = normalizedStateToNumber(getElement('state_code').value);

  for (const [fieldId, featureName] of NUMERIC_FEATURE_FIELDS) {
    featureMap[canonicalFeatureName(featureName)] = toNumber(getElement(fieldId).value);
  }

  for (const [fieldId, featureName] of BOOLEAN_FEATURE_FIELDS) {
    featureMap[canonicalFeatureName(featureName)] = boolToInt(getElement(fieldId).checked);
  }

  return featureMap;
}

function predictLinearFromJsonModel(loadedModel, featureMap) {
  const featureNames = loadedModel.feature_names;
  const coefficients = loadedModel.coef;
  const intercept = toNumber(loadedModel.intercept, 0);

  if (!Array.isArray(featureNames) || !Array.isArray(coefficients) || featureNames.length !== coefficients.length) {
    throw new Error('model.json ist ungueltig: feature_names und coef passen nicht zusammen.');
  }

  let prediction = intercept;
  for (let index = 0; index < featureNames.length; index += 1) {
    const requestedFeature = canonicalFeatureName(featureNames[index]);
    if (!(requestedFeature in featureMap)) {
      throw new Error('Feature aus model.json fehlt im UI: ' + featureNames[index]);
    }
    prediction += toNumber(coefficients[index], 0) * toNumber(featureMap[requestedFeature], 0);
  }

  return prediction;
}

function validateNumericInputs() {
  for (const [fieldId] of NUMERIC_FEATURE_FIELDS) {
    const value = Number(getElement(fieldId).value);
    if (Number.isNaN(value)) {
      throw new Error('Ungueltiger Zahlenwert in Feld: ' + fieldId);
    }
  }
}

function setResult(message, isError = false, highlightPrediction = false) {
  const result = document.getElementById('result');
  result.textContent = message;
  result.classList.toggle('alert-danger', isError);
  result.classList.toggle('prediction-highlight', highlightPrediction && !isError);
  result.classList.toggle('alert-success', highlightPrediction && !isError);
  result.classList.toggle('alert-light', !isError && !highlightPrediction);
}

async function loadModel() {
  try {
    const response = await fetch(MODEL_FILE);
    if (!response.ok) {
      throw new Error(MODEL_FILE + ' konnte nicht geladen werden.');
    }
    modelData = await response.json();

    getElement('predictBtn').disabled = false;
    setResult(MODEL_FILE + ' geladen. Bitte Werte eingeben und Vorhersage berechnen.');
  } catch (error) {
    setResult('Fehler beim Laden des Modells: ' + error.message, true);
  }
}

function predict() {
  if (!modelData) {
    setResult('Modell ist noch nicht bereit.', true);
    return;
  }

  try {
    validateNumericInputs();
  } catch (error) {
    setResult(error.message, true);
    return;
  }

  const featureMap = buildFeatureMapFromUI();
  const prediction = predictLinearFromJsonModel(modelData, featureMap);

  setResult('Vorhergesagter Wert: ' + prediction.toFixed(2), false, true);
}

document.addEventListener('DOMContentLoaded', () => {
  const sliderBindings = [
    ['relationships', 'relationships_val'],
    ['funding_rounds', 'funding_rounds_val'],
    ['milestones', 'milestones_val']
  ];

  for (const [sliderId, labelId] of sliderBindings) {
    const slider = document.getElementById(sliderId);
    const valueLabel = document.getElementById(labelId);
    slider.addEventListener('input', () => {
      valueLabel.textContent = slider.value;
    });
  }

  loadModel();
});
