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

const NOISY_ICON_SRC = "chrome://" + EXT_NAME + "/content/tab_icon.svg";
const NOT_NOISY_ICON_SRC = "chrome://" + EXT_NAME + "/content/tab_icon_muted.svg";

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
    return (document.getAnonymousElementByAttribute(tab, "class", ENT_ICON_CLASS) !== null);
}

function createIconForTab(tab) {
    let document = tab.ownerDocument;
    let tabLabel = document.getAnonymousElementByAttribute(tab, "class", "tab-text tab-label");
    if (tabLabel) {
        let document = tab.ownerDocument;
        let icon = document.createElementNS(XUL_NS, "xul:image");
        icon.className = ENT_ICON_CLASS;
		icon.style.opacity = 1;
        icon.style.width = "12px";
        icon.style.height = icon.style.width;
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
        if (state === STATE_PLAYING) {
            tab.setAttribute(ENT_NOISY_ATTRIBUTE, true);
			entIcon.src = NOISY_ICON_SRC;
            entIcon.style.display = "inherit";
        } else if (state == STATE_MUTED) {
            tab.setAttribute(ENT_NOISY_ATTRIBUTE, false);
			entIcon.src = NOT_NOISY_ICON_SRC;
            entIcon.style.display = "inherit";
        } else {
            tab.removeAttribute(ENT_NOISY_ATTRIBUTE);
            entIcon.style.display = "none";
        }
		entIcon.style.marginLeft = "3px";
		entIcon.style.marginRight = "3px";
    }
}

function updateStatesForDocument(states, document) {
    let mediaElements = getMediaElementsFromDocument(document);
    let hasAnyNonPausedMediaElements = false;
    let hasAnyNonMutedMediaElements = false;
    for (let mediaElement of mediaElements) {
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

function toggleMuteMediaElementsInDocument(document, mute) {
    let mediaElements = getMediaElementsFromDocument(document);
    for (let mediaElement of mediaElements) {
        mediaElement.muted = mute;
    }
    let frameElements = document.getElementsByTagName("iframe");
    for (let frameElement of frameElements) {
        let frameWindow = frameElement.contentWindow;
        if (frameWindow != frameWindow.top) {
            toggleMuteMediaElementsInDocument(frameWindow.document, mute);
        }
    }
}

function toggleMediaElementsMute(tab) {
    if (tab.getAttribute(ENT_NOISY_ATTRIBUTE) !== null) {
        let mute = !(tab.getAttribute(ENT_MUTED_ATTRIBUTE) === "true");
		tab.setAttribute(ENT_MUTED_ATTRIBUTE, mute);
        let browser = tab.linkedBrowser;
        let document = browser.contentDocument;
        toggleMuteMediaElementsInDocument(document, mute);
    }
}

function onMediaElementEvent(event) {
    let mediaElement = event.target;
    let document = mediaElement.ownerDocument;
    let tab = findTabForDocument(document);
	if (tab.getAttribute(ENT_MUTED_ATTRIBUTE) === "true") {
        mediaElement.muted = true;
    }
    updateTabState(tab);
}

function addMediaElementEventListeners(window) {
    window.addEventListener("playing", onMediaElementEvent, true);
    window.addEventListener("volumechange", onMediaElementEvent, true);
    window.addEventListener("pause", onMediaElementEvent, true);
    window.addEventListener("emptied", onMediaElementEvent, true);
}

function removeMediaElementEventListeners(window) {
    window.removeEventListener("playing", onMediaElementEvent, true);
    window.removeEventListener("volumechange", onMediaElementEvent, true);
    window.removeEventListener("pause", onMediaElementEvent, true);
    window.removeEventListener("emptied", onMediaElementEvent, true);
}

function mutationEventListener(tab) {
    let browser = tab.linkedBrowser;
    let document = browser.contentDocument;
    let window = document.defaultView;

    this.onMutations = function(mutations) {
        mutations.forEach(function(mutation) {
            for (let removedNode of mutation.removedNodes) {
                if (removedNode instanceof window.HTMLMediaElement || removedNode.tagName === "iframe") {
                    updateTabState(tab);
                    break;
                }
            }
        });
    };
}

function plugIntoDocument(document, tab) {
    if (!document || !tab || Components.utils.isDeadWrapper(document) || Components.utils.isDeadWrapper(tab)) {
        return false;
    }

    if (document.body && !document.entObserver) {
        let window = document.defaultView;
        if (window) {
            addMediaElementEventListeners(window);
            let documentMutationEventListener = new mutationEventListener(tab);
            document["entObserver"] = new window.MutationObserver(documentMutationEventListener.onMutations);
            document.entObserver.observe(document.body, {childList: true, subtree: true});
            return true;
        }
    }
    return false;
}

function unplugFromDocument(document) {
    if (document && document.body && document.entObserver) {
        let window = document.defaultView;
        if (window) {
            removeMediaElementEventListeners(window);
            document.entObserver.disconnect();
            document.entObserver = undefined;

            let frameElements = document.getElementsByTagName("iframe");
            for (let frameElement of frameElements) {
                let frameWindow = frameElement.contentWindow;
                if (frameWindow != frameWindow.top) {
                    unplugFromDocument(frameWindow.document);
                }
            }
        }
    }
}

function plugIntoTab(tab) {
    let browser = tab.linkedBrowser;
    let document = browser.contentDocument;
    if (plugIntoDocument(document, tab)) {
        updateTabState(tab);
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
    if (plugIntoDocument(document, tab)) {
		if (tab.getAttribute(ENT_MUTED_ATTRIBUTE) === "true") {
			toggleMuteMediaElementsInDocument(document, true);
		}
        updateTabState(tab);
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
    tabBrowser.addEventListener("DOMContentLoaded", onDocumentLoad, true);
    tabBrowser.addEventListener("pagehide", onPageHide, true);
    tabBrowser.tabContainer.addEventListener("TabMove", onTabMove, false);
    tabBrowser.tabContainer.addEventListener("TabAttrModified", fixCloseTabButton, false);
}

function clearTabsForWindow(window) {
    let tabBrowser = window.gBrowser;
    for (let tab of tabBrowser.tabs) {
        unplugFromTab(tab);
    }
	unplugFromTabContextMenu(window);
    tabBrowser.removeEventListener("DOMContentLoaded", onDocumentLoad, true);
    tabBrowser.removeEventListener("pagehide", onPageHide, true);
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