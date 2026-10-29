// ==UserScript==
// @name         Car Tech Info Popup
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Affiche un pop-in avec les informations techniques colorées sur les fiches L'argus, Caradisiac et La Centrale
// @author       You
// @match        https://www.largus.fr/fiche-technique/*
// @match        https://www.caradisiac.com/fiches-techniques/*
// @match        https://www.lacentrale.fr/fiche-technique-voiture-*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=largus.fr
// @updateURL    https://raw.githubusercontent.com/sisichakal/car-tech-info-popup/main/car-tech-info-popup.user.js
// @downloadURL  https://raw.githubusercontent.com/sisichakal/car-tech-info-popup/main/car-tech-info-popup.user.js
// @grant        none
// ==/UserScript==

//
// One popup, three sites.
//
// L'argus, Caradisiac and La Centrale all publish the same technical figures in
// different markup. Everything below the SITE ADAPTERS section is shared: the
// colour thresholds, the parsing, the popup itself. An adapter only describes
// where its site hides the numbers.
//
// To support a fourth site, add an entry to SITES and an @match above.
//

(function () {
    'use strict';

    // =========================================================================
    // SHARED — colour scale
    // =========================================================================

    // [good, fair, poor] thresholds. Anything past the last one is "bad".
    const CRITERIA = {
        longueur:    [4.20, 4.40, 4.50],
        reservoir:   [60, 50, 40],
        poids:       [1250, 1400, 1500],
        coffre:      [450, 400, 350],
        coffreUtile: [1300, 1100, 950],
        roues:       [18, 16, 15],
        vitesseMax:  [200, 190, 180],
        acceleration:[8, 9, 10],
        urbain:      [6, 7, 8],
        puissance:   [150, 120, 90],
    };

    const NEUTRAL = { color: '#999999', background: '#99999920' };
    const GOOD    = { color: '#4CAF50', background: '#4CAF5020' };
    const FAIR    = { color: '#FF9800', background: '#FF980020' };
    const POOR    = { color: '#f44336', background: '#f4433620' };
    const BAD     = { color: '#ffffff', background: '#000000' };

    const MISSING = 'N/A';

    // =========================================================================
    // SHARED — numbers
    // =========================================================================

    function parseNumericValue(value) {
        if (!value || value === MISSING) {
            return null;
        }
        const cleaned    = value.toString().replace(/[^\d,.-]/g, '');
        const normalized = cleaned.replace(',', '.');
        const num        = parseFloat(normalized);
        return isNaN(num) ? null : num;
    }

    // isReverse: lower is better (length, weight, consumption, 0-100)
    function getColor(value, thresholds, isReverse = false) {
        const numValue = parseNumericValue(value);
        if (numValue === null) {
            return NEUTRAL;
        }
        const [first, second, third] = thresholds;
        if (isReverse) {
            if (numValue <= first)  return GOOD;
            if (numValue <= second) return FAIR;
            if (numValue <= third)  return POOR;
        } else {
            if (numValue >= first)  return GOOD;
            if (numValue >= second) return FAIR;
            if (numValue >= third)  return POOR;
        }
        return BAD;
    }

    // "1 157 l" -> "1157 l". Sites use spaces as thousands separators, and
    // without this a volume reads as 1 instead of 1157.
    function joinThousands(text) {
        return text.replace(/(\d)\s+(\d)/g, '$1$2');
    }

    function calcRange(conso, reservoir) {
        const consoNum     = parseNumericValue(conso);
        const reservoirNum = parseNumericValue(reservoir);
        if (!consoNum || !reservoirNum || consoNum === 0) {
            return null;
        }
        return Math.round((reservoirNum / consoNum) * 100);
    }

    function buildConsoLine(conso, reservoir) {
        const consoDisplay = conso !== MISSING ? conso + 'L' : MISSING;
        const range        = calcRange(conso, reservoir);
        const rangeDisplay = range !== null ? range + ' km' : MISSING;
        return consoDisplay + ' - ' + rangeDisplay;
    }

    // Fewer than four cylinders is held against the engine.
    // Argus and Caradisiac spell the count ("quatre cylindres")…
    function colourByCylinderWords(value) {
        if (!value || value === MISSING) {
            return NEUTRAL;
        }
        const match = value.toString().toLowerCase().match(/(\w+)\s+cylindre/);
        if (!match) {
            return NEUTRAL;
        }
        const words = {
            'un': 1, 'une': 1, 'deux': 2, 'trois': 3, 'quatre': 4,
            'cinq': 5, 'six': 6, 'sept': 7, 'huit': 8, 'neuf': 9, 'dix': 10,
        };
        return (words[match[1]] || 0) < 4 ? BAD : GOOD;
    }

    // …while the La Centrale string is rebuilt from a digit ("4 cyl.").
    function colourByCylinderDigits(value) {
        if (!value || value === MISSING) {
            return NEUTRAL;
        }
        const match = value.match(/^(\d+)\s*cyl/);
        if (!match) {
            return NEUTRAL;
        }
        return parseInt(match[1], 10) < 4 ? BAD : GOOD;
    }

    // =========================================================================
    // SHARED — reading values off the page
    //
    // An adapter yields candidate raw strings for a label, best source first.
    // The readers below walk those candidates and keep the first that makes
    // sense, so a row that matches the label but holds an unusable value does
    // not stop the search.
    // =========================================================================

    function makeReaders(candidatesFor) {
        function readNumber(terms) {
            for (const raw of candidatesFor(terms)) {
                const match = joinThousands(raw).match(/[\d,]+\.?\d*/);
                if (match && match[0] !== '') {
                    return match[0].replace(',', '.');
                }
            }
            return MISSING;
        }

        // Tyre sizes are written "205/55 R16" — only the rim diameter matters.
        function readWheel(terms) {
            for (const raw of candidatesFor(terms)) {
                const match = raw.match(/R(\d+)/i);
                if (match) {
                    return match[1];
                }
            }
            return MISSING;
        }

        function readText(terms) {
            for (const raw of candidatesFor(terms)) {
                if (raw) {
                    return raw;
                }
            }
            return MISSING;
        }

        return { readNumber, readWheel, readText };
    }

    // Shared candidate source: <tr> with at least two <td>, label then value.
    function* tableCandidates(selector, terms) {
        for (const term of terms) {
            for (const row of document.querySelectorAll(selector)) {
                const cells = row.querySelectorAll('td');
                if (cells.length < 2) {
                    continue;
                }
                const label = (cells[0].textContent || '').trim();
                if (label.toLowerCase().includes(term.toLowerCase())) {
                    yield (cells[1].textContent || '').trim();
                }
            }
        }
    }

    // =========================================================================
    // SITE ADAPTERS
    // =========================================================================

    const ARGUS = {
        key:    'argus',
        host:   'largus.fr',
        accent: '#333',
        // Spec pages end with a numeric id, e.g. -2046379.html
        isDetailPage: () => /-\d+\.html$/.test(window.location.pathname),
        bootDelay: 1000,

        *candidatesFor(terms) {
            yield* tableCandidates('table.versions-table tr', terms);

            // Legacy layout: .labelInfo followed by a .valeur sibling
            for (const term of terms) {
                for (const label of document.querySelectorAll('.labelInfo')) {
                    const text = label.textContent || label.innerText || '';
                    if (!text.toLowerCase().includes(term.toLowerCase())) {
                        continue;
                    }
                    let value = label.nextElementSibling;
                    if (!value || !value.classList.contains('valeur')) {
                        value = label.parentElement
                            ? label.parentElement.querySelector('.valeur')
                            : null;
                    }
                    if (!value || !value.classList.contains('valeur')) {
                        let current = label;
                        while (current.nextElementSibling) {
                            current = current.nextElementSibling;
                            if (current.classList.contains('valeur')) {
                                value = current;
                                break;
                            }
                        }
                    }
                    if (value && value.classList.contains('valeur')) {
                        yield (value.textContent || value.innerText || '').trim();
                    }
                }
            }
        },

        fields: {
            longueur:     { terms: ['longueur'] },
            largeur:      { terms: ['largeur'] },
            poids:        { terms: ['poids à vide'] },
            roues:        { terms: ['taille des roues avant'], mode: 'wheel' },
            puissance:    { terms: ['puissance réelle maxi'] },
            vitesseMax:   { terms: ['vitesse maximale'] },
            acceleration: { terms: ['0 à 100 km/h'] },
            urbain:       { terms: ['cycle urbain'] },
            mixte:        { terms: ['mixte'] },
            extraUrbain:  { terms: ['extra urbain'] },
            reservoir:    { terms: ['réservoir'] },
            roueSecours:  { terms: ['type de roue de secours', 'type de roues de secours'], mode: 'text' },
        },

        powerLabel: 'Puissance réelle maxi',

        // Two separate rows
        readCoffre(read) {
            return Promise.resolve({
                coffre:      read.readNumber(['volume de coffre']),
                coffreUtile: read.readNumber(['volume de coffre utile']),
            });
        },

        readArchitecture: read => read.readText(['architecture']),
        architectureColour: colourByCylinderWords,
    };

    const CARADISIAC = {
        key:    'caradisiac',
        host:   'caradisiac.com',
        accent: '#c00',
        // Detailed pages only: /fiches-techniques/<model>/<year>/<version>/
        isDetailPage: () => window.location.pathname
            .replace(/^\/fiches-techniques\//, '')
            .split('/')
            .filter(Boolean).length >= 3,
        bootDelay: 1000,

        *candidatesFor(terms) {
            yield* tableCandidates('table tr', terms);
        },

        fields: {
            longueur:     { terms: ['longueur'] },
            largeur:      { terms: ['largeur sans rétros', 'largeur'] },
            poids:        { terms: ['poids à vide'] },
            roues:        { terms: ['pneumatiques avant', 'pneus avant', 'taille des roues avant'], mode: 'wheel' },
            puissance:    { terms: ['puissance din', 'puissance maxi', 'puissance ch'] },
            vitesseMax:   { terms: ['vitesse maxi', 'vitesse maximale'] },
            acceleration: { terms: ['0 à 100', '0-100'] },
            urbain:       { terms: ['urbain', 'consommation urbaine', 'cycle urbain'] },
            mixte:        { terms: ['mixte', 'consommation mixte'] },
            extraUrbain:  { terms: ['extra-urbain', 'extra urbain', 'consommation extra'] },
            reservoir:    { terms: ['réservoir', 'capacité réservoir'] },
            roueSecours:  { terms: ['roue de secours', 'roues de secours'], mode: 'text' },
        },

        powerLabel: 'Puissance DIN',

        // Both volumes share one cell: "341 l / 1 157 l"
        readCoffre(read) {
            const raw = read.readText(['volume de coffre']);
            if (raw === MISSING) {
                return Promise.resolve({ coffre: MISSING, coffreUtile: MISSING });
            }
            const numbers = joinThousands(raw).match(/\d+/g);
            if (!numbers || numbers.length === 0) {
                return Promise.resolve({ coffre: MISSING, coffreUtile: MISSING });
            }
            return Promise.resolve({
                coffre:      numbers[0],
                coffreUtile: numbers.length > 1 ? numbers[1] : MISSING,
            });
        },

        readArchitecture: read => read.readText(['architecture', 'type de moteur']),
        architectureColour: colourByCylinderWords,
    };

    const LA_CENTRALE = {
        key:    'lacentrale',
        host:   'lacentrale.fr',
        accent: '#0055a4',
        isDetailPage: () => true,
        // React SPA: the figures arrive well after DOMContentLoaded
        bootDelay: 2500,

        *candidatesFor(terms) {
            // Label/value pairs with hashed CSS-module class names, matched on
            // a fragment so a rebuild of the site does not break them.
            for (const term of terms) {
                for (const row of document.querySelectorAll('[class*="SubCategory_subCategoryTitle"]')) {
                    const titleEl = row.querySelector('[class*="SubCategory_title"]');
                    const valueEl = row.querySelector('[class*="SubCategory_value"]');
                    if (!titleEl || !valueEl) {
                        continue;
                    }
                    const label = (titleEl.textContent || '').trim().toLowerCase();
                    if (label.includes(term.toLowerCase())) {
                        yield (valueEl.textContent || '').trim();
                    }
                }
            }
            // Fallback in case the page reverts to server-rendered tables
            yield* tableCandidates('table tr', terms);
        },

        fields: {
            longueur:     { terms: ['longueur'] },
            largeur:      { terms: ['largeur sans rétros', 'largeur'] },
            poids:        { terms: ['poids à vide'] },
            // "18 pouces", not a tyre size — read as a plain number
            roues:        { terms: ['diamètre des jantes avant'] },
            puissance:    { terms: ['puissance din'] },
            vitesseMax:   { terms: ['vitesse max'] },
            acceleration: { terms: ['accélération 0 à 100', '0 à 100'] },
            urbain:       { terms: ['consommation urbaine'] },
            mixte:        { terms: ['consommation mixte'] },
            extraUrbain:  { terms: ['consommation extra-urbaine', 'consommation extra urbaine'] },
            reservoir:    { terms: ['volume du réservoir', 'réservoir'] },
            roueSecours:  { terms: ['roue de secours', 'roues de secours'], mode: 'text' },
        },

        powerLabel: 'Puissance DIN',

        // The page shows "Moyen coffre"; the litres only render in a tooltip
        // gauge once the trigger is hovered, so the hover is simulated.
        readCoffre() {
            return new Promise((resolve) => {
                const done = coffre => resolve({ coffre, coffreUtile: MISSING });

                let block = null;
                for (const candidate of document.querySelectorAll('[class*="SubCategory_subCategory"]')) {
                    const titleEl = candidate.querySelector('[class*="SubCategory_title"]');
                    if (titleEl && (titleEl.textContent || '').trim().toLowerCase().includes('volume de coffre')) {
                        block = candidate;
                        break;
                    }
                }
                if (!block) {
                    done(MISSING);
                    return;
                }

                const trigger = block.querySelector('[class*="Tooltip_Tooltip_tooltipTriggerButton"]');
                const valueEl = block.querySelector('[class*="SubCategory_value"]');
                const fire = (el, types) => {
                    if (!el) {
                        return;
                    }
                    for (const type of types) {
                        el.dispatchEvent(new MouseEvent(type, { bubbles: true }));
                    }
                };

                fire(trigger, ['mouseenter', 'mouseover', 'focus']);
                fire(valueEl, ['mouseenter', 'mouseover']);

                setTimeout(() => {
                    // The gauge may render inside the block or in a portal
                    const gauge = block.querySelector('[class*="Gauge_Gauge_value"]')
                        || document.querySelector('[class*="Gauge_Gauge_value"]');
                    const match = gauge
                        ? joinThousands((gauge.textContent || '').trim()).match(/\d+/)
                        : null;

                    fire(trigger, ['mouseleave', 'mouseout', 'blur']);
                    fire(valueEl, ['mouseleave', 'mouseout']);

                    done(match ? match[0] : MISSING);
                }, 800);
            });
        },

        // No single architecture field here: rebuild one from three rows
        readArchitecture(read) {
            const parts = [
                read.readText(['nombre de cylindres']),
                read.readText(['alimentation']),
                read.readText(['type de suralimentation']),
            ];
            const usable = parts.filter(p => p !== MISSING && p !== 'NC');
            if (usable.length === 0) {
                return MISSING;
            }
            // Keep the cylinder count first so the colour rule can read it
            usable[0] = parts[0] !== MISSING && parts[0] !== 'NC' ? usable[0] + ' cyl.' : usable[0];
            return usable.join(' - ');
        },

        architectureColour: colourByCylinderDigits,
    };

    const SITES = [ARGUS, CARADISIAC, LA_CENTRALE];

    // =========================================================================
    // SHARED — popup
    // =========================================================================

    const POPUP_ID = 'car-tech-info-popup';
    let dismissed = false;

    function scriptVersion() {
        try {
            if (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) {
                return ' v' + GM_info.script.version;
            }
        } catch (e) {
            // GM_info is unavailable under some managers; the title copes
        }
        return '';
    }

    function readAllFields(site, read) {
        const data = {};
        for (const [name, spec] of Object.entries(site.fields)) {
            if (spec.mode === 'text') {
                data[name] = read.readText(spec.terms);
            } else if (spec.mode === 'wheel') {
                data[name] = read.readWheel(spec.terms);
            } else {
                data[name] = read.readNumber(spec.terms);
            }
        }
        return data;
    }

    function buildRows(site, data) {
        const withUnit = (value, unit) => (value !== MISSING ? value + unit : MISSING);

        const sizeDisplay = [withUnit(data.longueur, 'm'), withUnit(data.largeur, 'm')].join(' - ');
        const bootDisplay = [withUnit(data.coffre, 'L'), withUnit(data.coffreUtile, 'L')].join(' - ');

        // A full-size spare earns a tyre, anything else a cross
        let spareIcon = '';
        if (data.roueSecours !== MISSING) {
            spareIcon = data.roueSecours.toLowerCase().includes('normale')
                ? ' <span style="filter:hue-rotate(90deg) saturate(3) brightness(0.8);">🛞</span>'
                : ' 🚫';
        }

        return [
            { label: 'Longueur / Largeur',
              display: sizeDisplay,
              colorInfo: getColor(data.longueur, CRITERIA.longueur, true) },
            { label: 'Poids à vide',
              display: withUnit(data.poids, ' kg'),
              colorInfo: getColor(data.poids, CRITERIA.poids, true) },
            { label: 'Volume de coffre + volume utile',
              display: bootDisplay,
              colorInfo: getColor(data.coffre, CRITERIA.coffre, false) },
            { label: 'Taille des roues avant',
              display: withUnit(data.roues, '"') + spareIcon,
              colorInfo: getColor(data.roues, CRITERIA.roues, false) },
            { label: site.powerLabel,
              display: withUnit(data.puissance, ' ch'),
              colorInfo: getColor(data.puissance, CRITERIA.puissance, false) },
            { label: 'Vitesse maximale',
              display: withUnit(data.vitesseMax, ' km/h'),
              colorInfo: getColor(data.vitesseMax, CRITERIA.vitesseMax, false) },
            { label: '0 à 100 km/h',
              display: withUnit(data.acceleration, ' s'),
              colorInfo: getColor(data.acceleration, CRITERIA.acceleration, true) },
            { label: 'Conso Urbain',
              display: buildConsoLine(data.urbain, data.reservoir),
              colorInfo: getColor(data.urbain, CRITERIA.urbain, true) },
            { label: 'Conso Mixte',
              display: buildConsoLine(data.mixte, data.reservoir),
              colorInfo: getColor(data.mixte, CRITERIA.urbain, true) },
            { label: 'Conso Extra',
              display: buildConsoLine(data.extraUrbain, data.reservoir),
              colorInfo: getColor(data.extraUrbain, CRITERIA.urbain, true) },
            { label: 'Réservoir',
              display: withUnit(data.reservoir, ' L'),
              colorInfo: getColor(data.reservoir, CRITERIA.reservoir, false) },
            { label: 'Architecture',
              display: data.architecture,
              colorInfo: site.architectureColour(data.architecture) },
        ];
    }

    function renderPopup(site, rows) {
        const popup = document.createElement('div');
        popup.id = POPUP_ID;
        popup.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 380px;
            background: white;
            border: 2px solid #333;
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 10000;
            font-family: Arial, sans-serif;
            font-size: 14px;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            background: ${site.accent};
            color: white;
            padding: 10px;
            border-radius: 8px 8px 0 0;
            font-weight: bold;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        const title = document.createElement('span');
        title.textContent = 'Informations Techniques' + scriptVersion();
        const close = document.createElement('span');
        close.textContent = '×';
        close.style.cssText = 'cursor:pointer;font-size:18px;';
        header.append(title, close);

        const content = document.createElement('div');
        content.style.cssText = 'padding: 15px; max-height: 600px; overflow-y: auto;';

        for (const info of rows) {
            const row = document.createElement('div');
            row.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 0;
                border-bottom: 1px solid #eee;
            `;
            row.innerHTML = `
                <span style="font-weight:500;">${info.label}</span>
                <span style="
                    color:${info.colorInfo.color};
                    font-weight:bold;
                    padding:4px 8px;
                    border-radius:4px;
                    background:${info.colorInfo.background};
                ">${info.display}</span>
            `;
            content.appendChild(row);
        }

        popup.append(header, content);
        document.body.appendChild(popup);

        const remove = () => {
            dismissed = true;
            popup.remove();
        };

        close.addEventListener('click', (e) => {
            e.stopPropagation();
            remove();
        });

        document.addEventListener('click', function onOutsideClick(e) {
            if (!popup.contains(e.target)) {
                remove();
                document.removeEventListener('click', onOutsideClick);
            }
        });

        return popup;
    }

    async function createPopup(site) {
        if (dismissed || document.getElementById(POPUP_ID)) {
            return;
        }

        const read = makeReaders(terms => site.candidatesFor(terms));
        const data = readAllFields(site, read);

        const boot = await site.readCoffre(read);
        data.coffre      = boot.coffre;
        data.coffreUtile = boot.coffreUtile;
        data.architecture = site.readArchitecture(read);

        // Awaiting the boot volume gives another call time to win the race
        if (dismissed || document.getElementById(POPUP_ID)) {
            return;
        }

        console.log(`[CarTechInfo/${site.key}] Valeurs extraites:`, data);

        if (!Object.values(data).some(v => v !== MISSING)) {
            console.log(`[CarTechInfo/${site.key}] Aucune donnée trouvée, popup ignoré.`);
            return;
        }

        renderPopup(site, buildRows(site, data));
        console.log(`[CarTechInfo/${site.key}] Pop-in créé avec succès.`);
    }

    // =========================================================================
    // Bootstrap
    // =========================================================================

    const site = SITES.find(s => window.location.hostname.endsWith(s.host));
    if (!site || !site.isDetailPage()) {
        return;
    }

    const start = () => setTimeout(() => createPopup(site), site.bootDelay);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

    // Figures can land after the first attempt, so keep watching until the
    // popup exists or the user has dismissed it.
    let observerTimer = null;
    const observer = new MutationObserver(() => {
        if (dismissed || document.getElementById(POPUP_ID)) {
            return;
        }
        clearTimeout(observerTimer);
        observerTimer = setTimeout(() => createPopup(site), 1500);
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
