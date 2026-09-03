const LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'as', name: 'Assamese (অসমীয়া)' },
    { code: 'bn', name: 'Bengali (বাংলা)' },
    { code: 'doi', name: 'Dogri (डोगरी)' },
    { code: 'gu', name: 'Gujarati (ગુજરાતી)' },
    { code: 'hi', name: 'Hindi (हिन्दी)' },
    { code: 'kn', name: 'Kannada (ಕನ್ನಡ)' },
    { code: 'kok', name: 'Konkani (कोंकणी)' },
    { code: 'ml', name: 'Malayalam (മലയാളം)' },
    { code: 'mni', name: 'Manipuri (মৈতৈলোন্)' },
    { code: 'mr', name: 'Marathi (मराठी)' },
    { code: 'ne', name: 'Nepali (नेपाली)' },
    { code: 'or', name: 'Odia (ଓଡ଼ିଆ)' },
    { code: 'pa', name: 'Punjabi (ਪੰਜਾਬੀ)' },
    { code: 'sa', name: 'Sanskrit (संस्कृतम्)' },
    { code: 'sd', name: 'Sindhi (سنڌي)' },
    { code: 'ta', name: 'Tamil (தமிழ்)' },
    { code: 'te', name: 'Telugu (తెలుగు)' },
    { code: 'ur', name: 'Urdu (اردو)' }
];

let TRANSLATIONS = {};

let currentLanguage = 'en';

function t(key) {
    if (TRANSLATIONS[currentLanguage] && TRANSLATIONS[currentLanguage][key]) {
        return TRANSLATIONS[currentLanguage][key];
    }
    // Fallback to English
    return TRANSLATIONS['en'][key] || key;
}

function updateLanguage(langCode) {
    currentLanguage = langCode;
    
    // Update inner text
    // Walk all nodes to properly replace text without destroying child nodes (like input boxes inside labels)
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translatedText = t(key);
        
        // Some elements have child nodes we want to preserve (e.g. <span class="text-danger">*</span>)
        // If the element only has text, we can just replace textContent.
        // For labels with inputs or spans, we find the text node and replace its value.
        let textNodeUpdated = false;
        for (let i = 0; i < el.childNodes.length; i++) {
            const node = el.childNodes[i];
            if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim().length > 0) {
                node.nodeValue = translatedText;
                textNodeUpdated = true;
                break;
            }
        }
        
        // Fallback if no valid text node found
        if (!textNodeUpdated) {
            // We prepend to avoid deleting child nodes if possible
            if(el.childNodes.length > 0) {
                 el.insertBefore(document.createTextNode(translatedText), el.firstChild);
            } else {
                 el.textContent = translatedText;
            }
        }
    });

    // Update placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.setAttribute('placeholder', t(key));
    });
}

async function initLanguage() {
    try {
        const response = await fetch('translations.json');
        TRANSLATIONS = await response.json();
    } catch (e) {
        console.error("Failed to load translations.json", e);
    }

    const savedLang = localStorage.getItem('preferredLanguage') || 'en';
    currentLanguage = savedLang;

    const authSelector = document.getElementById('languageSelectorAuth');
    const appSelector = document.getElementById('languageSelectorApp');

    if (authSelector) authSelector.innerHTML = '';
    if (appSelector) appSelector.innerHTML = '';

    LANGUAGES.forEach(lang => {
        const option1 = document.createElement('option');
        option1.value = lang.code;
        option1.textContent = lang.name;
        if (lang.code === currentLanguage) option1.selected = true;
        
        if (authSelector) authSelector.appendChild(option1);

        const option2 = document.createElement('option');
        option2.value = lang.code;
        option2.textContent = lang.name;
        if (lang.code === currentLanguage) option2.selected = true;

        if (appSelector) appSelector.appendChild(option2);
    });

    const handleLanguageChange = (e) => {
        const newLang = e.target.value;
        localStorage.setItem('preferredLanguage', newLang);
        
        // Sync the other selector
        if (authSelector && authSelector !== e.target) authSelector.value = newLang;
        if (appSelector && appSelector !== e.target) appSelector.value = newLang;

        updateLanguage(newLang);
        
        document.dispatchEvent(new CustomEvent('languageChanged'));
    };

    if (authSelector) authSelector.addEventListener('change', handleLanguageChange);
    if (appSelector) appSelector.addEventListener('change', handleLanguageChange);

    updateLanguage(currentLanguage);
}

window.t = t;
window.updateLanguage = updateLanguage;
window.initLanguage = initLanguage;
