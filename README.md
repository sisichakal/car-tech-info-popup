# Argus Tech Info Popup

Userscript showing a colour-coded technical summary on L'argus spec-sheet pages.

[![Userscript](https://img.shields.io/badge/userscript-v2.1-blue)](argus-tech-info-popup.user.js) [![License: MPL 2.0](https://img.shields.io/badge/license-MPL%202.0-brightgreen)](LICENSE) [![No dependencies](https://img.shields.io/badge/dependencies-none-lightgrey)](#how-it-works)

Spec sheets are long tables where the numbers that matter are buried. This script lifts them into a single colour-coded popup.

## What it does

- Shows a popup summarising the key technical figures of the vehicle.
- Colour-codes each value so a good figure is obvious at a glance.
- Includes the real maximum power, which the page does not surface directly.

## Where it runs

- `largus.fr/fiche-technique/*`

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser.
2. Open [`argus-tech-info-popup.user.js`](argus-tech-info-popup.user.js) and click **Raw**.

Tampermonkey picks up the install prompt automatically. Updates are served through `@updateURL`, so later versions are offered without reinstalling.

## How it works

A single `.user.js` file of plain DOM code: no build step, no bundler, no external library.

## Related

Part of a set of car-shopping userscripts:
[Leboncoin](https://github.com/sisichakal/Leboncoin-Search-Helper) ·
[La Centrale](https://github.com/sisichakal/La-Centrale-Search-Helper) ·
[L'argus](https://github.com/sisichakal/Argus-Tech-Info-Popup) ·
[Caradisiac](https://github.com/sisichakal/Caradisiac-Tech-Info-Popup) ·
[La Centrale spec sheets](https://github.com/sisichakal/lacentrale-tech-info-popup)

## Known limitations

- Selectors track the site's current markup and will need updating when it changes.

## License

[Mozilla Public License 2.0](LICENSE).
