Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/Timer.jsm");

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
const EXT_NAME = "expose-noisy-tabs";

const STATE_PLAYING = 1;
const STATE_MUTED = 2;
const STATE_NOT_PLAYING = 3;

const ENT_ICON_CLASS = "entIcon";
const ENT_NOISY_ATTRIBUTE = "entNoisy";
const ENT_MUTED_ATTRIBUTE = "entMuted";
const ENT_CONTEXT_MENU_ITEM = "entContext";

const ICON_THEMES_PATH = "chrome://" + EXT_NAME + "/content/images/indicators/";
const NOISY_ICON_NAME = "/noisy.svg";
const NOT_NOISY_ICON_NAME = "/not_noisy.svg";

const NOISY_ICON_TOOLTIPTEXT = "Mute this tab";
const NOT_NOISY_ICON_TOOLTIPTEXT = "Unmute this tab";

const DEFAULT_PREFS = {
    iconSize: 14,
    iconOpacity: 75,
    iconThemeVariant: 1,
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
                toggleTabMute(tab);
                event.stopPropagation();
            }
        }, true);

        icon.onmouseover = function() {
            icon.style.opacity = 1.0;
        };

        icon.onmouseout = function() {
            icon.style.opacity = Prefs.getValue("iconOpacity") / 100;
        };

        if (tabLabel.ordinal) { // Tree Style Tab fix
            icon.setAttribute("ordinal", Number(tabLabel.ordinal) + 1);
        } else if (tabLabel.getAttribute("tabmix")) { // Tab Mix Plus fix
            let window = document.defaultView;
            if (window.getComputedStyle) {
                let ordinal = window.getComputedStyle(tabLabel, null).getPropertyValue("-moz-box-ordinal-group");
                if (ordinal) {
                    icon.setAttribute("ordinal", Number(ordinal) + 1);
                }
            }
        }

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

        if (state == STATE_NOT_PLAYING) {
            tab.removeAttribute(ENT_NOISY_ATTRIBUTE);
            entIcon.style.display = "none";
        } else {
            if (state == STATE_PLAYING) {
                tab.setAttribute(ENT_NOISY_ATTRIBUTE, true);
                entIcon.src = ICON_THEMES_PATH + Prefs.getValue("iconThemeVariant") + NOISY_ICON_NAME;
                entIcon.setAttribute("tooltiptext", NOISY_ICON_TOOLTIPTEXT);
            } else if (state == STATE_MUTED) {
                tab.setAttribute(ENT_NOISY_ATTRIBUTE, false);
                entIcon.src = ICON_THEMES_PATH + Prefs.getValue("iconThemeVariant") + NOT_NOISY_ICON_NAME;
                entIcon.setAttribute("tooltiptext", NOT_NOISY_ICON_TOOLTIPTEXT);
            }

            entIcon.style.display = "inherit";
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

    if (!hasAnyNonMutedMediaElements) {
        let frameElements = document.getElementsByTagName("iframe");
        for (let frameElement of frameElements) {
            let frameWindow = frameElement.contentWindow;
            if (frameWindow != frameWindow.top) {
                updateStatesForDocument(states, frameWindow.document);
            }
        }
    }
}

function getMediaElementsFromDocument(document) {
    let mediaElements = [];
    mediaElements.push.apply(mediaElements, document.getElementsByTagName("video"));
    mediaElements.push.apply(mediaElements, document.getElementsByTagName("audio"));
    return mediaElements;
}

function toggleTabMute(tab) {
    toggleMediaElementsMute(tab);
    updateTabState(tab);
}

function updateTabState(tab) {
    if (!tab) return;

    let browser = tab.linkedBrowser;
    if (!browser) return;

    let document = browser.contentDocument;

    let tabMuted = tab.getAttribute(ENT_MUTED_ATTRIBUTE) === "true";
    let states = { playing: false, playingMuted: false };
    updateStatesForDocument(states, document);

    let tabState = STATE_NOT_PLAYING;
    if ((states.playing || states.playingMuted) && !tabMuted) {
        tabState = STATE_PLAYING;
    } else if (tabMuted) {
        tabState = STATE_MUTED;
    }

    setIconForTab(tab, tabState);
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
    if (tab.getAttribute(ENT_NOISY_ATTRIBUTE) !== null) {
        let mute = !(tab.getAttribute(ENT_MUTED_ATTRIBUTE) === "true");
        tab.setAttribute(ENT_MUTED_ATTRIBUTE, mute);

        let browser = tab.linkedBrowser;
        let document = browser.contentDocument;
        toggleMediaElementsMuteInDocument(document, mute);
    }
}

function onKeyUp(event) {
    if (Prefs.getValue("enableKeyboardShortcut")) {
        // detect only Ctrl+M combination
        if (!event.altKey && !event.shiftKey &&
            event.ctrlKey && event.keyCode == 77) {
            let document = event.view.document;
            let tab = findTabForDocument(document);
            toggleTabMute(tab);
        }
    }
}

function onMediaElementEvent(event) {
    let mediaElement = event.target;
    let document = mediaElement.ownerDocument;
    let tab = findTabForDocument(document);

    if (tab.getAttribute(ENT_MUTED_ATTRIBUTE) === "true") {
        mediaElement.muted = true;
    }
    if (event.type === "loadstart" && !tab.selected &&
        Prefs.getValue("preventAutoBackgroundPlayback")) {
        mediaElement.pause();
    } else {
        updateTabState(tab);
    }
}

function addMediaElementEventListeners(window) {
    window.addEventListener("playing", onMediaElementEvent, true);
    window.addEventListener("volumechange", onMediaElementEvent, true);
    window.addEventListener("pause", onMediaElementEvent, true);
    window.addEventListener("emptied", onMediaElementEvent, true);
    window.addEventListener("loadstart", onMediaElementEvent, true);
    window.addEventListener("seeking", onMediaElementEvent, true);
}

function removeMediaElementEventListeners(window) {
    window.removeEventListener("playing", onMediaElementEvent, true);
    window.removeEventListener("volumechange", onMediaElementEvent, true);
    window.removeEventListener("pause", onMediaElementEvent, true);
    window.removeEventListener("emptied", onMediaElementEvent, true);
    window.removeEventListener("loadstart", onMediaElementEvent, true);
    window.removeEventListener("seeking", onMediaElementEvent, true);
}

function enableMediaNodeForceAttach(document) {

    if (!document.getElementById("ENTAttachPoint")) {
        let attachPoint = document.createElement("div");
        attachPoint.id = "ENTAttachPoint";
        attachPoint.style.display = "none";
        document.documentElement.appendChild(attachPoint);
    }

    let overwriteFunc = '                                               \
        (function(){                                                    \
        var elementConstructor = document.createElement;                \
        document.createElement = function (name) {                      \
            var el = elementConstructor.apply(document, arguments);     \
                                                                        \
            if (el instanceof HTMLMediaElement) {                       \
                window.setTimeout(function() {                          \
                    var ap = document.getElementById("ENTAttachPoint"); \
                    if (!el.parentNode && !!ap) {                       \
                        ap.appendChild(el);                             \
                    }                                                   \
                }, 500);                                                \
            }                                                           \
                                                                        \
            return el;                                                  \
        };                                                              \
        })();                                                           \
    ';

    let scriptInject = document.createElement("script");
    scriptInject.type = "application/javascript";
    scriptInject.innerHTML = overwriteFunc;
    document.head.appendChild(scriptInject);

    // Some websites don't like having another script tag on the DOM
    // Removing the script element after it runs will satisfy the websites without stopping the code effect
    document.head.removeChild(scriptInject);
}

function mutationEventListener(tab) {
    let browser = tab.linkedBrowser;
    let document = browser.contentDocument;
    let window = document.defaultView;

    this.onMutations = function(mutations) {
        mutations.forEach(function(mutation) {
            for (let removedNode of mutation.removedNodes) {
                if (removedNode instanceof window.HTMLMediaElement ||
                    (removedNode.tagName && removedNode.tagName.toLowerCase() == "iframe")) {
                    updateTabState(tab);
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

    if (document.body && document.head && !document.entObserver) {
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
        updateTabState(tab);
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
            if (tab.getAttribute(ENT_MUTED_ATTRIBUTE) === "true") {
                toggleMediaElementsMuteInDocument(document, true);
            }
            if (!tab.selected && Prefs.getValue("preventAutoBackgroundPlayback")) {
                pauseAllMediaElementsInDocument(document);
            } else {
                updateTabState(tab);
            }

            addHotkeyEventListener(tab);
        }
    }
}

function onPageHide(event) {
    let document = event.target;
    let tab = findTabForDocument(document);

    setTimeout(function() {
        updateTabState(tab);
    }, 100);
}

function onTabMove(event) {
    let tab = event.target;
    updateTabState(tab);
}

function fixCloseTabButton(event) {
    let tab = event.target;
    if (hasTabIcon(tab)) {
        let document = tab.ownerDocument;
        let closeButton = document.getAnonymousElementByAttribute(tab, "class", "tab-close-button close-icon");

        if (tab.selected) {
            closeButton.setAttribute("selected", true);
        } else {
            closeButton.removeAttribute("selected");
        }
    }
}

function fixIconOrdinal(event) {
    let tab = event.target;
    if (hasTabIcon(tab)) {
        setTimeout(function() {
            let document = tab.ownerDocument;
            let tabLabel = document.getAnonymousElementByAttribute(tab, "class", "tab-text tab-label");
            if (tabLabel.ordinal) { // Tree Style Tab fix
                let entIcon = document.getAnonymousElementByAttribute(tab, "class", ENT_ICON_CLASS);
                entIcon.setAttribute("ordinal", Number(tabLabel.ordinal) + 1);

                // force icon element redraw after ordinal change
                if (entIcon.style.display == "inherit") {
                    entIcon.style.display = "inline";
                    setTimeout(function() {
                        if (entIcon.style.display != "none") {
                            entIcon.style.display = "inherit";
                        }
                    }, 0);
                }
            }
        }, 100);
    }
}

let tabContextMenuPopupShowingListener = function(e) {
    let document = e.target.ownerDocument;
    let tab = document.popupNode;
    let label = (tab.getAttribute(ENT_MUTED_ATTRIBUTE) === "true") ?
                NOT_NOISY_ICON_TOOLTIPTEXT : NOISY_ICON_TOOLTIPTEXT;
    let muteTabMenuItem = document.getElementById(ENT_CONTEXT_MENU_ITEM);
    muteTabMenuItem.setAttribute("label", label);
};

let tabContextMenuItemCommandListener = function(e) {
    let document = e.target.ownerDocument;
    let tab = document.popupNode;
    toggleTabMute(tab);
};

function plugIntoTabContextMenu(window) {
    let document = window.document;
    let tabContextMenu = window.gBrowser.tabContextMenu;
    let muteTabMenuItem = document.createElementNS(XUL_NS, "menuitem");
    muteTabMenuItem.setAttribute("id", ENT_CONTEXT_MENU_ITEM);
    muteTabMenuItem.addEventListener("command", tabContextMenuItemCommandListener);
    tabContextMenu.addEventListener("popupshowing", tabContextMenuPopupShowingListener);
    tabContextMenu.insertBefore(muteTabMenuItem, tabContextMenu.firstChild.nextSibling);
}

function unplugFromTabContextMenu(window) {
    let document = window.document;
    let muteTabMenuItem = document.getElementById(ENT_CONTEXT_MENU_ITEM);
    let tabContextMenu = window.gBrowser.tabContextMenu;
    tabContextMenu.removeEventListener("popupshowing", tabContextMenuPopupShowingListener);
    tabContextMenu.removeChild(muteTabMenuItem);
}

function initTabsForWindow(window) {
    let tabBrowser = window.gBrowser;
    for (let tab of tabBrowser.tabs) {
        plugIntoTab(tab);
    }

    plugIntoTabContextMenu(window);

    tabBrowser.addEventListener("pagehide", onPageHide, true);
    tabBrowser.addEventListener("readystatechange", onDocumentLoad, true);
    tabBrowser.tabContainer.addEventListener("TabMove", onTabMove, false);
    tabBrowser.tabContainer.addEventListener("TabSelect", fixIconOrdinal, false);
    tabBrowser.tabContainer.addEventListener("TabAttrModified", fixCloseTabButton, false);
}

function clearTabsForWindow(window) {
    let tabBrowser = window.gBrowser;
    for (let tab of tabBrowser.tabs) {
        unplugFromTab(tab);
    }

    unplugFromTabContextMenu(window);

    tabBrowser.removeEventListener("pagehide", onPageHide, true);
    tabBrowser.removeEventListener("readystatechange", onDocumentLoad, true);
    tabBrowser.tabContainer.removeEventListener("TabMove", onTabMove, false);
    tabBrowser.tabContainer.removeEventListener("TabSelect", fixIconOrdinal, false);
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
    Components.utils.import("chrome://" + EXT_NAME + "/content/modules/prefs.js", Imports);

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