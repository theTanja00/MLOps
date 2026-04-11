let modelData = null;

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

function normalizeStateCode(value) {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === 'CA' || raw === 'NY') {
    return raw;
  }
  return 'OTHER';
}

function canonicalFeatureName(name) {
  return String(name ?? '').toLowerCase().replace(/[ _]/g, '');
}

function buildFeatureMapFromUI() {
  const stateCodeMap = { CA: 1, NY: 2, OTHER: 0 };
  const normalizedState = normalizeStateCode(document.getElementById('state_code').value);

  const rawFeatures = {
    state_code: stateCodeMap[normalizedState] ?? 0,
    age_first_funding_year: toNumber(document.getElementById('age_first_funding_year').value),
    age_last_funding_year: toNumber(document.getElementById('age_last_funding_year').value),
    age_first_milestone_year: toNumber(document.getElementById('age_first_milestone_year').value),
    age_last_milestone_year: toNumber(document.getElementById('age_last_milestone_year').value),
    relationships: toNumber(document.getElementById('relationships').value),
    funding_rounds: toNumber(document.getElementById('funding_rounds').value),
    funding_total_usd: toNumber(document.getElementById('funding_total_usd').value),
    milestones: toNumber(document.getElementById('milestones').value),
    has_Investor: boolToInt(document.getElementById('has_Investor').checked),
    founding_year: toNumber(document.getElementById('founding_year').value),
    first_funding_year: toNumber(document.getElementById('first_funding_year').value),
    last_funding_year: toNumber(document.getElementById('last_funding_year').value),
    'is_Mountain View': boolToInt(document.getElementById('is_mountain_view').checked),
    'is_New York': boolToInt(document.getElementById('is_new_york').checked),
    'is_Palo Alto': boolToInt(document.getElementById('is_palo_alto').checked),
    'is_San Francisco': boolToInt(document.getElementById('is_san_francisco').checked),
    'is_Santa Clara': boolToInt(document.getElementById('is_santa_clara').checked),
    is_other: boolToInt(document.getElementById('is_other').checked)
  };

  const featureMap = {};
  for (const [key, value] of Object.entries(rawFeatures)) {
    featureMap[canonicalFeatureName(key)] = value;
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

function predictWithCustomModel(loadedModel, featureMap) {
  // Platzhalter: Hier kannst du spaeter weitere Modelltypen einbauen (z. B. NN, Tree, kNN).
  // Beispiel:
  // if (loadedModel.model_type === 'neural_network') {
  //   return myNeuralNetPredict(loadedModel, featureMap);
  // }
  throw new Error('Kein Pradiktor fuer model_type="' + String(loadedModel.model_type) + '" implementiert.');
}

function predictWithLoadedModel(loadedModel, featureMap) {
  const hasLinearFields = Array.isArray(loadedModel.coef) && Array.isArray(loadedModel.feature_names);
  if (hasLinearFields) {
    return predictLinearFromJsonModel(loadedModel, featureMap);
  }
  return predictWithCustomModel(loadedModel, featureMap);
}

function validateNumericInputs() {
  const numericIds = [
    'age_first_funding_year',
    'age_last_funding_year',
    'age_first_milestone_year',
    'age_last_milestone_year',
    'relationships',
    'funding_rounds',
    'funding_total_usd',
    'milestones',
    'founding_year',
    'first_funding_year',
    'last_funding_year'
  ];

  for (const id of numericIds) {
    const value = Number(document.getElementById(id).value);
    if (Number.isNaN(value)) {
      throw new Error('Ungueltiger Zahlenwert in Feld: ' + id);
    }
  }
}

function setResult(message, isError = false) {
  const result = document.getElementById('result');
  result.textContent = message;
  result.classList.toggle('alert-danger', isError);
  result.classList.toggle('alert-light', !isError);
}

async function loadModel() {
  try {
    const response = await fetch('model.json');
    if (!response.ok) {
      throw new Error('model.json konnte nicht geladen werden.');
    }
    modelData = await response.json();

    document.getElementById('predictBtn').disabled = false;
    setResult('model.json geladen. Bitte Werte eingeben und Vorhersage berechnen.');
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
  const prediction = predictWithLoadedModel(modelData, featureMap);

  setResult('Vorhergesagter Wert: ' + prediction.toFixed(2));
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
