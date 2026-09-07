import json
import codecs

with codecs.open('d:/Internship/jal-seva-aankalan/frontend/translations.json', 'r', 'utf-8') as f:
    data = json.load(f)

new_keys = {
    "image_proof": "Image Proof",
    "image_proof_help": "Max size 1 MB",
    "video_proof": "Video Proof",
    "video_proof_help": "Max size 5 MB, Max length 2 min"
}

for lang in data:
    for key, value in new_keys.items():
        if key not in data[lang]:
            data[lang][key] = value

with codecs.open('d:/Internship/jal-seva-aankalan/frontend/translations.json', 'w', 'utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=4)
