Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/Timer.jsm");

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
const EXT_NAME = "expose-noisy-tabs";

const STATE_PLAYING = 1;
const STATE_PLAYING_MUTED = 2;
const STATE_NOT_PLAYING = 3;

const ENT_ICON_CLASS = "entIcon";

const NOISY_ICON_SRC = "chrome://" + EXT_NAME + "/content/tab_icon.png";
const NOT_NOISY_ICON_SRC = "chrome://" + EXT_NAME + "/content/tab_icon_muted.png";
    
const NOISY_ICON_TOOLTIPTEXT = "Mute this tab";
const NOT_NOISY_ICON_TOOLTIPTEXT = "Unmute this tab";

function findTabForDocument(document) {
    let documentWindow = document.defaultView.top;
    let windowsEnumerator = Services.wm.getEnumerator("navigator:browser");
    while (windowsEnumerator.hasMoreElements()) {
        let window = windowsEnumerator.getNext().QueryInterface(Components.interfaces.nsIDOMWindow);
        let tabBrowser = window.gBrowser;
        for (let currentTab of tabBrowser.tabs) {
            let browser = window.gBrowser.getBrowserForTab(currentTab);
            let contentWindow = browser.contentWindow;
            if (contentWindow == documentWindow) {
                return currentTab;
            }
        }
    }
    return null;
}

function hasTabIcon(tab) {
    let document = tab.ownerDocument;
    return (document.getAnonymousElementByAttribute(tab, "class", ENT_ICON_CLASS) != null);
}

function createIconForTab(tab) {
    let document = tab.ownerDocument;
    let tabLabel = document.getAnonymousElementByAttribute(tab, "class", "tab-text tab-label");
    if (tabLabel) {
        let document = tab.ownerDocument;
        let icon = document.createElementNS(XUL_NS, "xul:image");
        let normalOpacity = "0.75";
        let hoverOpacity = "1.0";
        icon.className = ENT_ICON_CLASS;
        icon.style.opacity = normalOpacity;
        icon.addEventListener("mousedown", function(event) {
            if (event.button == 0) {
                toggleMediaElementsMute(tab);
                event.stopPropagation();
            }
        }, true);
        icon.onmouseover = function() {
            icon.style.opacity = hoverOpacity;
        };
        icon.onmouseout = function() {
            icon.style.opacity = normalOpacity;
        };
        tabLabel.parentNode.insertBefore(icon, tabLabel.nextSibling);
        return true;
    }
    return false;
}

function clearIconFromTab(tab) {
    let document = tab.ownerDocument;
    let entIcon = document.getAnonymousElementByAttribute(tab, "class", ENT_ICON_CLASS);
    if (entIcon) {
        entIcon.parentNode.removeChild(entIcon);
    }
    tab.removeAttribute("noisy");
};

function setIconForTab(tab, state) {
    if (hasTabIcon(tab) || createIconForTab(tab)) {
        let document = tab.ownerDocument;
        let entIcon = document.getAnonymousElementByAttribute(tab, "class", ENT_ICON_CLASS);
        if (state == STATE_PLAYING) {
            entIcon.src = NOISY_ICON_SRC;
            entIcon.setAttribute("tooltiptext", NOISY_ICON_TOOLTIPTEXT);
            tab.setAttribute("noisy", true);
        } else if (state == STATE_PLAYING_MUTED) {
            entIcon.src = NOT_NOISY_ICON_SRC;
            entIcon.setAttribute("tooltiptext", NOT_NOISY_ICON_TOOLTIPTEXT);
            tab.setAttribute("noisy", false);
        } else {
            tab.removeAttribute("noisy");
            entIcon.src = null;
        }
    }
}

function updateStatesForDocument(states, document) {
    let mediaElements = getMediaElementsFromDocument(document);
    let hasAnyNonPausedMediaElements = false;
    let hasAnyNonMutedMediaElements = false;
    for (mediaElement of mediaElements) {
        if (mediaElement.mozHasAudio !== false) {
            if (!mediaElement.paused) {
                hasAnyNonPausedMediaElements = true;
                if (!mediaElement.muted) {
                    hasAnyNonMutedMediaElements = true;
                    break;
                }
            }
        }
    }
    if (hasAnyNonPausedMediaElements) {
        if (hasAnyNonMutedMediaElements) {
            states.playing = true;
        } else {
            states.playingMuted = true;
        }
    }
    let frames = document.getElementsByTagName("iframe");
    for (let frame of frames) {
        let frameWindow = frame.contentWindow;
        if (frameWindow != frameWindow.top) {
            updateStatesForDocument(states, frameWindow.document);
        }
    }
}

function updateIconForTab(tab) {
    let browser = tab.linkedBrowser;
    if (browser) {
        let document = browser.contentDocument;
        let states = {
            playing: false,
            playingMuted: false
        }
        updateStatesForDocument(states, document);
        if (states.playing) {
            setIconForTab(tab, STATE_PLAYING);
        } else if (states.playingMuted) {
            setIconForTab(tab, STATE_PLAYING_MUTED);
        } else if (hasTabIcon(tab)) {
            setIconForTab(tab, STATE_NOT_PLAYING);
        }
    }
}

function getMediaElementsFromDocument(document) {
    let mediaElements = [];
    mediaElements.push.apply(mediaElements, document.getElementsByTagName("video"));
    mediaElements.push.apply(mediaElements, document.getElementsByTagName("audio"));
    return mediaElements;
}

function toggleMuteMediaElementsInDocument(document, mute) {
    let mediaElements = getMediaElementsFromDocument(document);
    for (let mediaElement of mediaElements) {
        mediaElement.muted = mute;
    }
    let frames = document.getElementsByTagName("iframe");
    for (let frame of frames) {
        let frameWindow = frame.contentWindow;
        if (frameWindow != frameWindow.top) {
            toggleMuteMediaElementsInDocument(frameWindow.document, mute);
        }
    }
}

function toggleMediaElementsMute(tab) {
    if (tab.getAttribute("noisy") != null) {
        let mute = (tab.getAttribute("noisy") == "true");
        let browser = tab.linkedBrowser;
        let document = browser.contentDocument;
        toggleMuteMediaElementsInDocument(document, mute);
    }
}

function onMediaElementPlaying(event) {
    let mediaElement = event.target;
    let document = mediaElement.ownerDocument;
    let tab = findTabForDocument(document);
    updateIconForTab(tab);
}

function onMediaElementVolumeChange(event) {
    let mediaElement = event.target;
    let document = mediaElement.ownerDocument;
    let tab = findTabForDocument(document);
    updateIconForTab(tab);
}

function onMediaElementPause(event) {
    let mediaElement = event.target;
    let document = mediaElement.ownerDocument;
    let tab = findTabForDocument(document);
    updateIconForTab(tab);
}

function onMediaElementEmptied(event) {
    let mediaElement = event.target;
    let document = mediaElement.ownerDocument;
    let tab = findTabForDocument(document);
    updateIconForTab(tab);
}

function addMediaElementEventListeners(window) {
    window.addEventListener("playing", onMediaElementPlaying, true);
    window.addEventListener("volumechange", onMediaElementVolumeChange, true);
    window.addEventListener("pause", onMediaElementPause, true);
    window.addEventListener("emptied", onMediaElementEmptied, true);
}

function removeMediaElementEventListeners(window) {
    window.removeEventListener("playing", onMediaElementPlaying, true);
    window.removeEventListener("volumechange", onMediaElementVolumeChange, true);
    window.removeEventListener("pause", onMediaElementPause, true);
    window.removeEventListener("emptied", onMediaElementEmptied, true);
}

function mutationEventListener(tab) {
    this.onFramesMutation = function(mutations) {
        mutations.forEach(function(mutation) {
            for (let removedNode of mutation.removedNodes) {
                if (removedNode.tagName == "IFRAME") {
                    if (removedNode.contentWindow) {
                        updateIconForTab(tab);
                        break;
                    }
                }
            }
        });
    };
    
    this.onMediaElementsMutation = function(mutations) {
        let messedWithMediaElements = false;
        mutations.forEach(function(mutation) {
            for (let addedNode of mutation.addedNodes) {
                if (addedNode.tagName == "VIDEO" || addedNode.tagName == "AUDIO") {
                    addMediaElementEventListeners(addedNode);
                    messedWithMediaElements = true;
                }
            }
            for (let removedNode of mutation.removedNodes) {
                if (removedNode.tagName == "VIDEO" || removedNode.tagName == "AUDIO") {
                    messedWithMediaElements = true;
                    break;
                }
            }
        });
        if (messedWithMediaElements) {
            updateIconForTab(tab);
        }
    };
}

function plugIntoDocument(document, tab) {
    if (document && document.body && !document.entMediaElementsObserver) {
        let window = document.defaultView;
        addMediaElementEventListeners(window);
        let documentMutationEventListener = new mutationEventListener(tab);
        document["entMediaElementsObserver"] = new window.MutationObserver(documentMutationEventListener.onMediaElementsMutation);
        document.entMediaElementsObserver.observe(document.body, {childList: true, subtree: true});
        document["entFramesObserver"] = new window.MutationObserver(documentMutationEventListener.onFramesMutation);
        document.entFramesObserver.observe(document.body, {childList: true, subtree: true});
        let frames = document.getElementsByTagName("iframe");
        for (let frame of frames) {
            let frameWindow = frame.contentWindow;
            if (frameWindow != frameWindow.top) {
                plugIntoDocument(frameWindow.document, tab);
            }
        }
        return true;
    }
    return false;
}

function unplugFromDocument(document) {
    if (document.body && document.entMediaElementsObserver) {
        let window = document.defaultView;
        removeMediaElementEventListeners(window);
        if (document.entMediaElementsObserver && document.entFramesObserver) {
            document.entMediaElementsObserver.disconnect();
            document.entMediaElementsObserver = undefined;
            document.entFramesObserver.disconnect();
            document.entFramesObserver = undefined;
        }
        let frames = document.getElementsByTagName("iframe");
        for (let frame of frames) {
            let frameWindow = frame.contentWindow;
            if (frameWindow != frameWindow.top) {
                unplugFromDocument(frameWindow.document);
            }
        }
    }
}

function plugIntoTab(tab) {
    let browser = tab.linkedBrowser;
    let document = browser.contentDocument;
    if (plugIntoDocument(document, tab)) {
        updateIconForTab(tab);
    }
}

function unplugFromTab(tab) {
    let browser = tab.linkedBrowser;
    let document = browser.contentDocument;
    unplugFromDocument(document);
    clearIconFromTab(tab);
}

function onDocumentLoad(event) {
    let document = event.target;
    let tab = findTabForDocument(document);
    setTimeout(function() {
        if (plugIntoDocument(document, tab)) {
            updateIconForTab(tab);
        }
    }, 1000);
}

function onTabMove(event) {
    let tab = event.target;
    updateIconForTab(tab);
}

function fixCloseTabButton(event) {
    let tab = event.target;
    let document = tab.ownerDocument;
    let closeButton = document.getAnonymousElementByAttribute(tab, "class", "tab-close-button close-icon");
    closeButton.setAttribute("selected", tab.selected);
}

function initTabsForWindow(window) {
    let tabBrowser = window.gBrowser;
    for (let tab of tabBrowser.tabs) {
        plugIntoTab(tab);
    }
    tabBrowser.addEventListener("load", onDocumentLoad, true);
    tabBrowser.tabContainer.addEventListener("TabMove", onTabMove, false);
    tabBrowser.tabContainer.addEventListener("TabAttrModified", fixCloseTabButton, false);
}

function clearTabsForWindow(window) {
    let tabBrowser = window.gBrowser;
    for (let tab of tabBrowser.tabs) {            
        unplugFromTab(tab);
    }
    tabBrowser.removeEventListener("load", onDocumentLoad, true);
    tabBrowser.tabContainer.removeEventListener("TabMove", onTabMove, false);
    tabBrowser.tabContainer.removeEventListener("TabAttrModified", fixCloseTabButton, false);
}

let windowListener = {
    onOpenWindow: function(nsIObj) {
        let window = nsIObj.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                              .getInterface(Components.interfaces.nsIDOMWindow);    
        window.addEventListener("load", function() {
            window.removeEventListener("load", arguments.callee, false);
            if (window.document.documentElement.getAttribute("windowtype") === "navigator:browser") {
                initTabsForWindow(window);
            }
        });
    },
    
    onCloseWindow: function(nsIObj) {
        let window = nsIObj.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                              .getInterface(Components.interfaces.nsIDOMWindow);    
        if (window.document.documentElement.getAttribute("windowtype") === "navigator:browser") {
            clearTabsForWindow(window);
        }
    }
};

function initWindows() {
    let windowsEnumerator = Services.wm.getEnumerator("navigator:browser");
    while (windowsEnumerator.hasMoreElements()) {
        let window = windowsEnumerator.getNext().QueryInterface(Components.interfaces.nsIDOMWindow);
        initTabsForWindow(window);
    }
    Services.wm.addListener(windowListener);
}

function clearWindows() {
    Services.wm.removeListener(windowListener);
    let windowsEnumerator = Services.wm.getEnumerator("navigator:browser");
    while (windowsEnumerator.hasMoreElements()) {
        let window = windowsEnumerator.getNext().QueryInterface(Components.interfaces.nsIDOMWindow);
        clearTabsForWindow(window);
    }
}

function startup(data, reason) {
    initWindows();
}

function shutdown(data, reason) {
    clearWindows();
}

function install(data, reason) {}

function uninstall(data, reason) {}