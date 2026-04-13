let modelData = null;
const MODEL_FILE = 'model.json';

const FEATURE_INPUT_ALIASES = {
  foundingyear: 'founded_at',
  firstfundingyear: 'first_funding_at',
  lastfundingyear: 'last_funding_at',
  hasvc: 'has_vc',
  hasinvestor: 'has_investor',
  hasrounda: 'has_rounda',
  hasroundb: 'has_roundb',
  hasroundc: 'has_roundc',
  hasroundd: 'has_roundd',
  hasroundabcd: 'has_roundabcd',
  isca: 'is_ca',
  isny: 'is_ny',
  isma: 'is_ma',
  istx: 'is_tx'
};

const YEAR_FEATURES = new Set(['foundingyear', 'firstfundingyear', 'lastfundingyear']);
const TEXT_FEATURES = new Set(['categorycode']);
const CATEGORY_ONE_HOT_FEATURES = [
  'is_software',
  'is_web',
  'is_mobile',
  'is_enterprise',
  'is_advertising',
  'is_gamesvideo',
  'is_ecommerce',
  'is_biotech',
  'is_consulting',
  'is_othercategory'
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

function dateToYear(rawDate) {
  const timestamp = Date.parse(rawDate);
  if (Number.isNaN(timestamp)) {
    throw new Error('Ungueltiges Datum: ' + rawDate);
  }
  return new Date(timestamp).getUTCFullYear();
}

function findInputIdForFeature(featureName) {
  const canonicalName = canonicalFeatureName(featureName);
  const normalizedName = String(featureName ?? '').replace(/\s+/g, '_').toLowerCase();
  const candidates = [
    FEATURE_INPUT_ALIASES[canonicalName],
    String(featureName ?? ''),
    normalizedName,
    canonicalName
  ].filter(Boolean);

  for (const inputId of candidates) {
    if (document.getElementById(inputId)) {
      return inputId;
    }
  }

  return null;
}

function valueFromInput(inputId, canonicalFeature) {
  const element = getElement(inputId);

  if (YEAR_FEATURES.has(canonicalFeature)) {
    return dateToYear(element.value);
  }

  if (element.type === 'checkbox') {
    return boolToInt(element.checked);
  }

  return toNumber(element.value);
}

function categorySelectionToOneHot(categoryValue) {
  const selected = String(categoryValue ?? '').toLowerCase();
  const featureMap = {};

  for (const featureName of CATEGORY_ONE_HOT_FEATURES) {
    featureMap[canonicalFeatureName(featureName)] = featureName === selected ? 1 : 0;
  }

  return featureMap;
}

function buildFeatureMapFromUI(featureNames) {
  const featureMap = {};
  const categoryOneHotMap = categorySelectionToOneHot(getElement('category_one_hot').value);

  for (const featureName of featureNames) {
    const canonicalName = canonicalFeatureName(featureName);
    if (canonicalName in categoryOneHotMap) {
      featureMap[canonicalName] = categoryOneHotMap[canonicalName];
      continue;
    }

    const inputId = findInputIdForFeature(featureName);
    if (!inputId) {
      throw new Error('Kein passendes UI-Feld fuer Feature gefunden: ' + featureName);
    }
    featureMap[canonicalName] = valueFromInput(inputId, canonicalName);
  }

  return featureMap;
}

function predictLinearFromJsonModel(loadedModel, featureMap) {
  const featureNames = loadedModel.feature_names;
  const rawCoefficients = loadedModel.coef;
  const coefficients = Array.isArray(rawCoefficients?.[0]) ? rawCoefficients[0] : rawCoefficients;
  const intercept = toNumber(loadedModel.intercept, 0);
  const scalerMean = loadedModel.scaler_mean || loadedModel.feature_means || null;
  const scalerScale = loadedModel.scaler_scale || loadedModel.feature_stds || null;

  if (!Array.isArray(featureNames) || !Array.isArray(coefficients) || featureNames.length !== coefficients.length) {
    throw new Error('model.json ist ungueltig: feature_names und coef passen nicht zusammen.');
  }

  let prediction = intercept;
  for (let index = 0; index < featureNames.length; index += 1) {
    const requestedFeature = canonicalFeatureName(featureNames[index]);
    if (!(requestedFeature in featureMap)) {
      throw new Error('Feature aus model.json fehlt im UI: ' + featureNames[index]);
    }

    let featureValue = toNumber(featureMap[requestedFeature], 0);
    if (
      Array.isArray(scalerMean) &&
      Array.isArray(scalerScale) &&
      scalerMean.length === coefficients.length &&
      scalerScale.length === coefficients.length
    ) {
      const mean = toNumber(scalerMean[index], 0);
      const scale = toNumber(scalerScale[index], 1);
      const safeScale = scale === 0 ? 1 : scale;
      featureValue = (featureValue - mean) / safeScale;
    }

    prediction += toNumber(coefficients[index], 0) * featureValue;
  }

  return prediction;
}

function sigmoid(value) {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

function validateInputsForModel(featureNames) {
  const categoryOneHotMap = categorySelectionToOneHot(getElement('category_one_hot').value);

  for (const featureName of featureNames) {
    const canonicalName = canonicalFeatureName(featureName);
    if (canonicalName in categoryOneHotMap) {
      continue;
    }

    const inputId = findInputIdForFeature(featureName);

    if (!inputId) {
      throw new Error('Kein passendes UI-Feld fuer Feature gefunden: ' + featureName);
    }

    const element = getElement(inputId);
    if (YEAR_FEATURES.has(canonicalName) && Number.isNaN(Date.parse(element.value))) {
      throw new Error('Ungueltiges Datum in Feld: ' + inputId);
    }

    if (element.type !== 'checkbox' && !YEAR_FEATURES.has(canonicalName) && !TEXT_FEATURES.has(canonicalName)) {
      if (Number.isNaN(Number(element.value))) {
        throw new Error('Ungueltiger Zahlenwert in Feld: ' + inputId);
      }
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

function initExclusiveCheckboxGroup(fieldIds) {
  for (const fieldId of fieldIds) {
    const checkbox = getElement(fieldId);
    checkbox.addEventListener('change', () => {
      if (!checkbox.checked) {
        return;
      }

      for (const otherId of fieldIds) {
        if (otherId !== fieldId) {
          getElement(otherId).checked = false;
        }
      }
    });
  }
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
    validateInputsForModel(modelData.feature_names || []);
  } catch (error) {
    setResult(error.message, true);
    return;
  }

  try {
    const featureMap = buildFeatureMapFromUI(modelData.feature_names || []);
    const linearScore = predictLinearFromJsonModel(modelData, featureMap);
    const probability = sigmoid(linearScore);
    const threshold = toNumber(modelData.threshold, 0.5);
    const label = probability >= threshold;
    setResult(label ? 'erfolgreich' : 'nicht erfolgreich', false, true);
  } catch (error) {
    setResult('Vorhersage fehlgeschlagen: ' + error.message, true);
  }
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

  initExclusiveCheckboxGroup(['is_ca', 'is_ny', 'is_ma', 'is_tx', 'is_otherstate']);

  loadModel();
});
