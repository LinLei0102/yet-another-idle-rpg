"use strict";

import { global_flags } from "./main.js";

//For now, translations are only used for dialogues

const translations = {};
const default_language = "english";

class TranslationManager {
    constructor() {}

    init = async(language) => {
        if(!translations[language]) {
            try {
                const module = await import(`../locales/${language}.js`);
                translations[language] = module.default;
                console.log(`Language '${language}' loaded!`);
            } catch(error) {
                //汉化补丁：语言包缺失时回退到英文，避免卡在加载界面
                console.warn(`Could not load language '${language}', falling back to '${default_language}'.`, error);
                if(language !== default_language) {
                    await this.init(default_language);
                    translations[language] = translations[default_language];
                } else {
                    translations[language] = {};
                }
            }
        }
    };

    getText = (language, text_id) => {
        if(!translations[language]?.[text_id]) {
            //todo: try fallback to default if a different language is being used
            //will need to init the default first, if it's not loaded yet


            //otherwise:
            return "text not found, id: " + text_id;
        } else {
            if(global_flags.is_mofu_mofu_enabled) {
                const key = "mofu#" + text_id;
                return translations[language][key] || translations[language][text_id];
            } else {
                return translations[language][text_id];
            }
        }
    };

    translateUI = async(language) => {
        const translatables = document.querySelectorAll('[data-translation]');
        translatables.forEach(elem => {
            elem.innerText = this.getText(language, elem.dataset.translation);
        });

    };
}

const translationManager = new TranslationManager();

export { translationManager, translations };
