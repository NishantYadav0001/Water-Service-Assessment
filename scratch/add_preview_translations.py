import json
import codecs

with codecs.open('d:/Internship/jal-seva-aankalan/frontend/translations.json', 'r', 'utf-8') as f:
    data = json.load(f)

new_keys = {
    "preview_confirm": "Are you sure you want to review your assessment before final submission?",
    "preview_mode": "Preview Mode Activated",
    "edit_form": "Edit Form",
    "final_submit": "Final Submit",
    "pending": "Pending"
}

for lang in data:
    for key, value in new_keys.items():
        if key not in data[lang]:
            data[lang][key] = value

with codecs.open('d:/Internship/jal-seva-aankalan/frontend/translations.json', 'w', 'utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=4)
