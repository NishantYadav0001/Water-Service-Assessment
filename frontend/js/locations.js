/**
 * Location Data — loading, cascading dropdowns, and geographic helpers.
 *
 * Exports:
 *   loadLocations()         — fetch all_india_locations.json
 *   populateSelect()        — fill a <select> with options
 *   getLocationData()       — accessor for the raw location tree
 *   isLocationDataReady()   — whether the JSON has loaded
 */

let locationData = {};
let isLocationDataLoaded = false;

export function getLocationData() {
    return locationData;
}

export function isLocationDataReady() {
    return isLocationDataLoaded;
}

export async function loadLocations() {
    try {
        const response = await fetch('all_india_locations.json');
        locationData = await response.json();
        isLocationDataLoaded = true;
        initCascadingDropdowns();

        // Hide loaders and show fields
        document.getElementById('dashboard-location-loader').classList.add('hidden');
        document.getElementById('dashboard-location-fields').classList.remove('hidden');

        document.getElementById('form-location-loader').classList.add('hidden');
        document.getElementById('form-location-fields').classList.remove('hidden');

    } catch (error) {
        console.error('Failed to load locations dataset:', error);
        document.getElementById('dashboard-location-loader').innerHTML = `<span class="text-danger">Failed to load geographic dataset. Please ensure all_india_locations.json is present.</span>`;
        document.getElementById('form-location-loader').innerHTML = `<span class="text-danger">Failed to load geographic dataset.</span>`;
    }
}

export function populateSelect(selectEl, options, defaultText) {
    selectEl.innerHTML = `<option value="">${defaultText}</option>`;
    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        selectEl.appendChild(option);
    });
    selectEl.disabled = options.length === 0;
}

function setupCascading(stateId, districtId, subdistrictId, villageId, isFilter = false) {
    const stateEl = document.getElementById(stateId);
    const districtEl = document.getElementById(districtId);
    const subdistrictEl = document.getElementById(subdistrictId);
    const villageEl = document.getElementById(villageId);

    const defaultText = isFilter ? 'All' : 'Select';

    stateEl.addEventListener('change', () => {
        const state = stateEl.value;
        if (state && locationData[state]) {
            populateSelect(districtEl, Object.keys(locationData[state]).sort(), `${defaultText} District`);
        } else {
            populateSelect(districtEl, [], `${defaultText} District`);
        }
        populateSelect(subdistrictEl, [], `${defaultText} Sub-District`);
        populateSelect(villageEl, [], `${defaultText} Village`);
    });

    districtEl.addEventListener('change', () => {
        const state = stateEl.value;
        const district = districtEl.value;
        if (district && locationData[state] && locationData[state][district]) {
            populateSelect(subdistrictEl, Object.keys(locationData[state][district]).sort(), `${defaultText} Sub-District`);
        } else {
            populateSelect(subdistrictEl, [], `${defaultText} Sub-District`);
        }
        populateSelect(villageEl, [], `${defaultText} Village`);
    });

    subdistrictEl.addEventListener('change', () => {
        const state = stateEl.value;
        const district = districtEl.value;
        const subdistrict = subdistrictEl.value;

        let villageText = defaultText + ' Village';
        if (window.t) {
            villageText = defaultText === 'All' ? window.t('all') + ' ' + window.t('village') : window.t('select_village');
        }

        if (subdistrict && locationData[state] && locationData[state][district] && locationData[state][district][subdistrict]) {
            populateSelect(villageEl, locationData[state][district][subdistrict].sort(), villageText);
        } else {
            populateSelect(villageEl, [], villageText);
        }
    });
}

function initCascadingDropdowns() {
    const states = Object.keys(locationData).sort();

    let selectStateText = window.t ? window.t('select_state') : 'Select State';
    let allStatesText = window.t ? (window.t('all') + ' ' + window.t('state')) : 'All States';

    const formState = document.getElementById('secA-state');
    if (formState) populateSelect(formState, states, selectStateText);

    const filterState = document.getElementById('filter-state');
    if (filterState) populateSelect(filterState, states, allStatesText);

    setupCascading('secA-state', 'secA-district', 'secA-subdistrict', 'secA-village');
    setupCascading('filter-state', 'filter-district', 'filter-subdistrict', 'filter-village', true);

    const regState = document.getElementById('reg-state');
    if (regState) populateSelect(regState, states, selectStateText);
    setupCascading('reg-state', 'reg-district', 'reg-subdistrict', 'reg-village');
}
