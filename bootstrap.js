Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/Timer.jsm");

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
const EXT_NAME = "expose-noisy-tabs";

const STATE_PLAYING = 1;
const STATE_PLAYING_MUTED = 2;
const STATE_NOT_PLAYING = 3;

const ENT_ICON_CLASS = "entIcon";
const ENT_NOISY_ATTRIBUTE = "entNoisy";

const ICON_THEMES_PATH = "chrome://" + EXT_NAME + "/content/icon_themes/";
const NOISY_ICON_NAME = "/noisy.png";
const NOT_NOISY_ICON_NAME = "/not_noisy.png";

const NOISY_ICON_TOOLTIPTEXT = "Mute this tab";
const NOT_NOISY_ICON_TOOLTIPTEXT = "Unmute this tab";

const DEFAULT_PREFS = {
    iconSize: 16,
    iconOpacity: 75,
    iconTheme: 1,
    enableKeyboardShortcut: true,
    preventAutoBackgroundPlayback: false
};

let Prefs = null;
let onPrefsApply = null;

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
        icon.className = ENT_ICON_CLASS;
        icon.style.opacity = Prefs.getValue("iconOpacity") / 100;
        icon.style.width = Prefs.getValue("iconSize") + "px";
        icon.style.height = icon.style.width;
        icon.addEventListener("mousedown", function(event) {
            if (event.button == 0) {
                toggleMediaElementsMute(tab);
                event.stopPropagation();
            }
        }, true);
        
        icon.onmouseover = function() {
            icon.style.opacity = 1.0;
        };
        
        icon.onmouseout = function() {
            icon.style.opacity = Prefs.getValue("iconOpacity") / 100;
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
        tab.removeAttribute(ENT_NOISY_ATTRIBUTE);
    }
}

function setIconForTab(tab, state) {
    if (hasTabIcon(tab) || createIconForTab(tab)) {
        let document = tab.ownerDocument;
        let entIcon = document.getAnonymousElementByAttribute(tab, "class", ENT_ICON_CLASS);
        
        if (state == STATE_PLAYING) {
            tab.setAttribute(ENT_NOISY_ATTRIBUTE, true);
            entIcon.src = ICON_THEMES_PATH + Prefs.getValue("iconTheme") + NOISY_ICON_NAME;
            entIcon.setAttribute("tooltiptext", NOISY_ICON_TOOLTIPTEXT);
        } else if (state == STATE_PLAYING_MUTED) {
            tab.setAttribute(ENT_NOISY_ATTRIBUTE, false);
            entIcon.src = ICON_THEMES_PATH + Prefs.getValue("iconTheme") + NOT_NOISY_ICON_NAME;
            entIcon.setAttribute("tooltiptext", NOT_NOISY_ICON_TOOLTIPTEXT);
        } else {
            tab.removeAttribute(ENT_NOISY_ATTRIBUTE);
            entIcon.src = null;
        }
    }
}

function updateStatesForDocument(states, document) {
    let hasAnyNonPausedMediaElements = false;
    let hasAnyNonMutedMediaElements = false;
    
    let mediaElements = getMediaElementsFromDocument(document);
    for (let mediaElement of mediaElements) {
        if (mediaElement.mozHasAudio !== false && !mediaElement.paused &&
            mediaElement.seeking !== true) {
            hasAnyNonPausedMediaElements = true;
            
            if (!mediaElement.muted) {
                hasAnyNonMutedMediaElements = true;
                break;
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
    
    let frameElements = document.getElementsByTagName("iframe");
    for (let frameElement of frameElements) {
        let frameWindow = frameElement.contentWindow;
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
        };
        
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

function toggleMediaElementsMuteInDocument(document, mute) {
    let mediaElements = getMediaElementsFromDocument(document);
    for (let mediaElement of mediaElements) {
        mediaElement.muted = mute;
    }
    
    let frameElements = document.getElementsByTagName("iframe");
    for (let frameElement of frameElements) {
        let frameWindow = frameElement.contentWindow;
        if (frameWindow != frameWindow.top) {
            toggleMediaElementsMuteInDocument(frameWindow.document, mute);
        }
    }
}

function toggleMediaElementsMute(tab) {
    if (tab.getAttribute(ENT_NOISY_ATTRIBUTE) != null) {
        let mute = (tab.getAttribute(ENT_NOISY_ATTRIBUTE) == "true");
        let browser = tab.linkedBrowser;
        let document = browser.contentDocument;
        
        toggleMediaElementsMuteInDocument(document, mute);
    }
}

function onKeyUp(event) {
    if (Prefs.getValue("enableKeyboardShortcut")) {
        if (event.ctrlKey && event.keyCode == 77) { // ctrl + m
            let document = event.view.document;
            let tab = findTabForDocument(document);
            
            toggleMediaElementsMute(tab);
        }
    }
}

function onMediaElementEvent(event) {
    let mediaElement = event.target;
    let document = mediaElement.ownerDocument;
    let tab = findTabForDocument(document);
    
    if (event.type === "loadeddata" && !tab.selected &&
        Prefs.getValue("preventAutoBackgroundPlayback")) {
        mediaElement.pause();
    } else {
        updateIconForTab(tab);
    }
}

function addMediaElementEventListeners(window) {
    window.addEventListener("playing", onMediaElementEvent, true);
    window.addEventListener("volumechange", onMediaElementEvent, true);
    window.addEventListener("pause", onMediaElementEvent, true);
    window.addEventListener("emptied", onMediaElementEvent, true);
    window.addEventListener("loadeddata", onMediaElementEvent, true);
    window.addEventListener("seeking", onMediaElementEvent, true);
}

function removeMediaElementEventListeners(window) {
    window.removeEventListener("playing", onMediaElementEvent, true);
    window.removeEventListener("volumechange", onMediaElementEvent, true);
    window.removeEventListener("pause", onMediaElementEvent, true);
    window.removeEventListener("emptied", onMediaElementEvent, true);
    window.removeEventListener("loadeddata", onMediaElementEvent, true);
    window.removeEventListener("seeking", onMediaElementEvent, true);
}

function enableMediaNodeForceAttach(document) {
    let overwriteFunc = `
        (function(){
        var elementConstructor = document.createElement;
        document.createElement = function (name) {
            var el = elementConstructor.apply(document, arguments);

            if (el.tagName === "AUDIO" || el.tagName === "VIDEO") {
                window.setTimeout(function() {
                    if (!el.parentNode) {
                        document.body.appendChild(el);
                    }
                }, 500);
            }

            return el;
        };
        })();
    `;
    
    let scriptInject = document.createElement('script');
    scriptInject.language = "javascript";
    scriptInject.innerHTML = overwriteFunc;
    document.body.appendChild(scriptInject);
}

function mutationEventListener(tab) {
    this.onMutations = function(mutations) {
        mutations.forEach(function(mutation) {
            for (let removedNode of mutation.removedNodes) {
                if (removedNode.tagName == "VIDEO" || removedNode.tagName == "AUDIO" ||
                    removedNode.tagName == "IFRAME") {
                    updateIconForTab(tab);
                    break;
                }
            }
        });
    };
}

function plugIntoDocument(document, tab, isFirstDocument) {
    if (Components.utils.isDeadWrapper(document) || Components.utils.isDeadWrapper(tab)) {
        return false;
    }

    if (document.body && !document.entObserver) {
        let window = document.defaultView;
        if (window) {
            enableMediaNodeForceAttach(document);
            addMediaElementEventListeners(window);

            let documentMutationEventListener = new mutationEventListener(tab);
            document["entObserver"] = new window.MutationObserver(documentMutationEventListener.onMutations);
            document.entObserver.observe(document.body, {childList: true, subtree: true});
            
            if (isFirstDocument) {
                plugIntoDocumentFrames(document, tab);
            }
            
            return true;
        }
    }
    
    return false;
}

function plugIntoDocumentFrames(document, tab) {
    let frameElements = document.getElementsByTagName("iframe");
    for (let frameElement of frameElements) {
        let frameWindow = frameElement.contentWindow;
        if (frameWindow != frameWindow.top) {
            plugIntoDocument(frameWindow.document, tab, true);
        }
    }
}

function unplugFromDocument(document) {
    if (document && document.body && document.entObserver) {
        let window = document.defaultView;
        if (window) {
            removeMediaElementEventListeners(window);

            document.entObserver.disconnect();
            document.entObserver = undefined;

            unplugFromDocumentFrames(document);
        }
    }
}

function unplugFromDocumentFrames(document) {
    let frameElements = document.getElementsByTagName("iframe");
    for (let frameElement of frameElements) {
        let frameWindow = frameElement.contentWindow;
        if (frameWindow != frameWindow.top) {
            unplugFromDocument(frameWindow.document);
        }
    }
}

function addHotkeyEventListener(tab) {
    if (tab) {
        let browser = tab.linkedBrowser;
        let document = browser.contentDocument;
        document.addEventListener("keyup", onKeyUp, false);
    }
}

function removeHotkeyEventListener(tab) {
    if (tab) {
        let browser = tab.linkedBrowser;
        let document = browser.contentDocument;
        document.removeEventListener("keyup", onKeyUp, false);
    }
}

function plugIntoTab(tab) {
    let browser = tab.linkedBrowser;
    let document = browser.contentDocument;
    
    if (plugIntoDocument(document, tab, true)) {
        addHotkeyEventListener(tab);
        updateIconForTab(tab);
    }
}

function unplugFromTab(tab) {
    let browser = tab.linkedBrowser;
    let document = browser.contentDocument;
    
    unplugFromDocument(document);
    removeHotkeyEventListener(tab);
    clearIconFromTab(tab);
}

function pauseAllMediaElementsInDocument(document) {
    let mediaElements = getMediaElementsFromDocument(document);
    for (let mediaElement of mediaElements) {
        mediaElement.pause();
    }
    
    let frameElements = document.getElementsByTagName("iframe");
    for (let frameElement of frameElements) {
        let frameWindow = frameElement.contentWindow;
        if (frameWindow != frameWindow.top) {
            pauseAllMediaElementsInDocument(frameWindow.document);
        }
    }
}

function onDocumentLoad(event) {
    let document = event.target;
    let readyState = document.readyState;
    if (readyState === "interactive" || readyState === "loading") {
        let tab = findTabForDocument(document);
        
        if (plugIntoDocument(document, tab)) {
            if (!tab.selected && Prefs.getValue("preventAutoBackgroundPlayback")) {
                pauseAllMediaElementsInDocument(document);
            } else {
                updateIconForTab(tab);
            }
            
            addHotkeyEventListener(tab);
        }
    }
}

function onPageHide(event) {
    let document = event.target;
    let tab = findTabForDocument(document);
    
    setTimeout(function() {
        updateIconForTab(tab);
    }, 100);
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
    
    tabBrowser.addEventListener("pagehide", onPageHide, true);
    tabBrowser.addEventListener("readystatechange", onDocumentLoad, true);
    tabBrowser.tabContainer.addEventListener("TabMove", onTabMove, false);
    tabBrowser.tabContainer.addEventListener("TabAttrModified", fixCloseTabButton, false);
}

function clearTabsForWindow(window) {
    let tabBrowser = window.gBrowser;
    for (let tab of tabBrowser.tabs) {
        unplugFromTab(tab);
    }
    
    tabBrowser.removeEventListener("pagehide", onPageHide, true);
    tabBrowser.removeEventListener("readystatechange", onDocumentLoad, true);
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
    let Imports = {};
    Components.utils.import("chrome://" + EXT_NAME + "/content/prefs.js", Imports);
    
    Prefs = new Imports.Prefs(DEFAULT_PREFS, EXT_NAME);
    
    Services.obs.addObserver(Prefs.onOpen, "entPrefsOpen", false);
    Services.obs.addObserver(Prefs.onReset, "entPrefsReset", false);
    
    onPrefsApply = {
        observe: function(aSubject, aTopic, aData) {
            Prefs.onApply.observe(aSubject, aTopic, aData);
            clearWindows();
            initWindows();
        }
    };
    
    Services.obs.addObserver(onPrefsApply, "entPrefsApply", false);
    
    Prefs.init();
    initWindows();
}

function shutdown(data, reason) {
    Services.obs.removeObserver(Prefs.onOpen, "entPrefsOpen");
    Services.obs.removeObserver(Prefs.onReset, "entPrefsReset");
    Services.obs.removeObserver(onPrefsApply, "entPrefsApply");
    
    clearWindows();
}

function install(data, reason) {}

function uninstall(data, reason) {}