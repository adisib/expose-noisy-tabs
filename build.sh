#!/bin/bash
# pack everything into an .xpi archive
zip -rq expose-noisy-tabs.xpi \
    forms \
    images \
    modules \
    bootstrap.js \
    chrome.manifest \
    install.rdf \
    LICENSE