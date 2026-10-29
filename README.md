# Car Tech Info Popup

A userscript showing a colour-coded technical summary on L'argus, Caradisiac and La Centrale spec-sheet pages.

[![Userscript](https://img.shields.io/badge/userscript-v3.0-blue)](car-tech-info-popup.user.js)
[![License: MPL 2.0](https://img.shields.io/badge/license-MPL%202.0-brightgreen)](LICENSE)
[![No dependencies](https://img.shields.io/badge/dependencies-none-lightgrey)](#how-it-works)

Spec sheets are long tables where the figures that matter are buried. This script lifts them into a single popup and colours each one, so a good number is obvious at a glance.

## Contents

- [What it does](#what-it-does)
- [Where it runs](#where-it-runs)
- [Installation](#installation)
- [Configuration](#configuration)
- [How it works](#how-it-works)
- [Adding a site](#adding-a-site)
- [Known limitations](#known-limitations)
- [License](#license)

## What it does

A popup lists twelve figures, each tinted green, orange, red or black against a fixed set of thresholds:

| Row | Lower is better |
| --- | --- |
| Longueur / Largeur | yes |
| Poids à vide | yes |
| Volume de coffre + volume utile | no |
| Taille des roues avant | no |
| Puissance (DIN or réelle maxi) | no |
| Vitesse maximale | no |
| 0 à 100 km/h | yes |
| Conso urbain / mixte / extra | yes |
| Réservoir | no |
| Architecture | fewer than four cylinders counts against |

Each consumption row also shows the **range** it implies, computed from the tank size — the figure the spec sheet never gives you.

The spare wheel appears as an icon next to the wheel size: a tyre for a full-size spare, a cross for anything else.

## Where it runs

- `largus.fr/fiche-technique/*` — only on pages ending in a numeric id
- `caradisiac.com/fiches-techniques/*` — only on fully qualified version pages
- `lacentrale.fr/fiche-technique-voiture-*`

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser.
2. Open [`car-tech-info-popup.user.js`](car-tech-info-popup.user.js) and click **Raw**.

Tampermonkey picks up the install prompt automatically. Updates are served through `@updateURL`, so later versions are offered without reinstalling.

> **Upgrading from the three separate scripts?** Remove *Argus Tech Info Popup*, *Caradisiac Tech Info Popup* and *La Centrale Tech Info Popup* first, or the same page will show two popups.

## Configuration

Thresholds live in the `CRITERIA` constant, as `[good, fair, poor]`. Anything past the last value is rendered black.

```js
const CRITERIA = {
    coffre: [450, 400, 350],    // >=450 L green, >=400 orange, >=350 red, below that black
    poids:  [1250, 1400, 1500], // read the other way round: lower is better
};
```

## How it works

A single `.user.js` file of plain DOM code: no build step, no bundler, no external library.

The three sites publish the same figures in very different markup, so everything except the site adapters is shared — thresholds, parsing, range calculation and the popup itself. An adapter only says where its site hides the numbers.

Each adapter yields *candidate* raw strings for a label, best source first, and the shared readers keep the first one that parses. A row whose label matches but whose value is unusable therefore does not stop the search, which is what lets a single adapter cover both a site's current layout and its legacy one.

The awkward cases are handled per adapter: Caradisiac packs both boot volumes into one cell, La Centrale only renders the figure in a tooltip gauge once it is hovered, and it has no architecture field at all, so one is rebuilt from the cylinder count, the fuel system and the turbo row.

## Adding a site

Add an `@match` line and an entry to `SITES`:

```js
const MY_SITE = {
    key: 'example', host: 'example.com', accent: '#06c',
    isDetailPage: () => true,
    bootDelay: 1000,
    *candidatesFor(terms) { yield* tableCandidates('table tr', terms); },
    fields: { longueur: { terms: ['longueur'] } /* ... */ },
    powerLabel: 'Puissance DIN',
    readCoffre: read => Promise.resolve({ coffre: read.readNumber(['coffre']), coffreUtile: 'N/A' }),
    readArchitecture: read => read.readText(['architecture']),
    architectureColour: colourByCylinderWords,
};
```

## Known limitations

- Selectors track each site's current markup and will need updating when it changes.
- Search terms are matched as substrings, so a short term can also match a longer label: `urbain` matches *extra-urbaine* too. Terms are tried in order and the page is read top to bottom, which resolves it on today's layouts, but it is worth knowing when adding one.
- La Centrale publishes no usable figure for the seats-down boot volume, so that half of the row stays `N/A`.

## History

Supersedes three separate scripts, one per site, which carried identical thresholds and popup code:

- `Argus-Tech-Info-Popup` — this repository, renamed, up to v2.1
- `Caradisiac-Tech-Info-Popup` — merged in, repository removed
- `lacentrale-tech-info-popup` — merged in, repository removed

## License

[Mozilla Public License 2.0](LICENSE).
