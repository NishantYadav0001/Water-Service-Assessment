import json
import codecs

with codecs.open('d:/Internship/jal-seva-aankalan/frontend/translations.json', 'r', 'utf-8') as f:
    data = json.load(f)

# The EXACT strings currently in the file that mean "Jal Seva Aankalan"
# and the new replacements for "Drinking Water Service Assessment".
exact_replacements = {
    # Hindi (जल सेवा आकलन / जल सेवा आंकलन)
    "जल सेवा आकलन": "पेयजल सेवा आकलन",
    "जल सेवा आंकलन": "पेयजल सेवा आंकलन",
    "जल सेवा आँकलन": "पेयजल सेवा आँकलन",
    # Assamese
    "জল সেৱা আনকলন": "খোৱাপানী সেৱা আনকলন",
    # Bengali
    "জল সেবা আঁকলন": "পানীয় জল সেবা আঁকলন",
    # Gujarati
    "જલ સેવા આંકલન": "પીવાના પાણીની સેવા આંકલન",
    # Kannada
    "ಜಲ ಸೇವಾ ಅಂಕಲನ್": "ಕುಡಿಯುವ ನೀರಿನ ಸೇವಾ ಅಂಕಲನ್",
    # Malayalam
    "ജലസേവ ആങ്കളൻ": "കുടിവെള്ള സേവന വിലയിരുത്തൽ",
    # Meitei
    "ꯖꯜ ꯁꯦꯕꯥ ꯑꯥꯅꯀꯥꯂꯟ": "ꯊꯛꯅꯕꯥ ꯏꯁꯤꯡ ꯁꯦꯕꯥꯒꯤ ꯑꯥꯅꯀꯥꯂꯟ",
    "ꯖꯜ ꯁꯦꯕꯥ ꯑꯥꯅꯀꯥꯂꯟ꯫": "ꯊꯛꯅꯕꯥ ꯏꯁꯤꯡ ꯁꯦꯕꯥꯒꯤ ꯑꯥꯅꯀꯥꯂꯟ",
    # Marathi
    "जल सेवा आकलन": "पेयजल सेवा आकलन",
    "जलसेवा अंकलनाबाबत": "पेयजल सेवा अंकलनाबाबत",
    # Nepali
    "जल सेवा आँकलन": "खानेपानी सेवा आँकलन",
    "जल सेवा आंकलन": "खानेपानी सेवा आँकलन",
    # Odia
    "ଜଲ୍ ସେବା ଆଙ୍କାଲାନ୍": "ପାନୀୟ ଜଳ ସେବା ଆଙ୍କାଲାନ୍",
    "ଜଲ ସେବା ଆଙ୍କାଲାନ": "ପାନୀୟ ଜଳ ସେବା ଆଙ୍କାଲାନ୍",
    # Punjabi
    "ਜਲ ਸੇਵਾ ਅਕਲੰ": "ਪੀਣ ਵਾਲੇ ਪਾਣੀ ਦੀ ਸੇਵਾ ਮੁਲਾਂਕਣ",
    "ਜਲ ਸੇਵਾ ਆਂਕਲਨ": "ਪੀਣ ਵਾਲੇ ਪਾਣੀ ਦੀ ਸੇਵਾ ਮੁਲਾਂਕਣ",
    # Sanskrit
    "जलसेवा आंकलनस्य": "पेयजलसेवा आंकलनस्य",
    # Sindhi
    "جل سيوا آنڪلن": "پيئڻ جي پاڻي جي خدمت جو جائزو",
    # Tamil
    "ஜல் சேவா அங்காளன்": "குடிநீர் சேவை மதிப்பீடு",
    # Telugu
    "జల్ సేవా అంకాలన్": "తాగునీటి సేవ అంచనా",
    # Urdu
    "جل سیوا آنکلن": "پینے کے پانی کی خدمت کا اندازہ"
}

for lang in data:
    if 'app_title' in data[lang]:
        title = data[lang]['app_title']
        for old, new in exact_replacements.items():
            if old in title:
                data[lang]['app_title'] = title.replace(old, new)
                break
                
    if 'declaration' in data[lang]:
        decl = data[lang]['declaration']
        for old, new in exact_replacements.items():
            if old in decl:
                data[lang]['declaration'] = decl.replace(old, new)
                # Not breaking here in case there are multiple replacements, though unlikely

with codecs.open('d:/Internship/jal-seva-aankalan/frontend/translations.json', 'w', 'utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=4)
