#!/bin/bash
# pack everything into an .xpi archive
zip -rq expose-noisy-tabs.xpi \
    bootstrap.js \
    prefs.js \
    prefs.xul \
    icon.png \
    tab_icon.png \
    tab_icon_muted.png \
    chrome.manifest \
    install.rdf \
    LICENSE