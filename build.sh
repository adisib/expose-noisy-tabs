#!/bin/bash
# pack everything into an .xpi archive
zip -rq expose-noisy-tabs.xpi \
    icon_themes \
    bootstrap.js \
    prefs.js \
    prefs.xul \
    icon.png \
    chrome.manifest \
    install.rdf \
    LICENSE