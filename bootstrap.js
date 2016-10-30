Components.utils.import("resource://gre/modules/Services.jsm");

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
    let tabStack = tab.boxObject.firstChild;
    return (tabStack.getElementsByClassName("entIcon").length > 0);
}

function createIconForTab(tab) {
    let tabStack = tab.boxObject.firstChild;
    let tabLabel = tabStack.getElementsByClassName("tab-text tab-label")[0];
    if (tabLabel) {
        let document = tab.ownerDocument;
        let icon = document.createElementNS(XUL_NS, "xul:image");
        let normalOpacity = "0.75";
        let hoverOpacity = "1.0";
        icon.className = ENT_ICON_CLASS;
        icon.style.opacity = normalOpacity;
        icon.addEventListener("mousedown", function(event) {
            toggleMediaElementsMute(tab);
            event.stopPropagation();
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
    let tabStack = tab.boxObject.firstChild;
    let entIcon = tabStack.getElementsByClassName(ENT_ICON_CLASS)[0];
    if (entIcon) {
        entIcon.parentNode.removeChild(entIcon);
    }
    tab.removeAttribute("noisy");
};

function setIconForTab(tab, state) {
    if (hasTabIcon(tab) || createIconForTab(tab)) {
        let tabStack = tab.boxObject.firstChild;
        let entIcon = tabStack.getElementsByClassName(ENT_ICON_CLASS)[0];
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

function toggleMediaElementsMute(tab) {
    if (tab.getAttribute("noisy") != null) {
        let muted = (tab.getAttribute("noisy") == "true");
        let browser = tab.linkedBrowser;
        let document = browser.contentDocument;
        let mediaElements = [];
        mediaElements.push.apply(mediaElements, document.getElementsByTagName("video"));
        mediaElements.push.apply(mediaElements, document.getElementsByTagName("audio"));
        for (let mediaElement of mediaElements) {
            mediaElement.muted = muted;
        }
    }
}

function onMediaElementPlaying(event) {
    let mediaElement = event.target;
    let document = mediaElement.ownerDocument;
    let tab = findTabForDocument(document);
    setIconForTab(tab, mediaElement.muted ? STATE_PLAYING_MUTED : STATE_PLAYING);
}

function onMediaElementVolumeChange(event) {
    let mediaElement = event.target;
    let document = mediaElement.ownerDocument;
    let tab = findTabForDocument(document);
    if (!mediaElement.paused) {
        setIconForTab(tab, mediaElement.muted ? STATE_PLAYING_MUTED : STATE_PLAYING);
    }
}

function onMediaElementPause(event) {
    let mediaElement = event.target;
    let document = mediaElement.ownerDocument;
    let tab = findTabForDocument(document);
    setIconForTab(tab, STATE_NOT_PLAYING);
}

function onMediaElementEmptied(event) {
    let mediaElement = event.target;
    let document = mediaElement.ownerDocument;
    let tab = findTabForDocument(document);
    setIconForTab(tab, STATE_NOT_PLAYING);
}

function addMediaElementEventListeners(mediaElement) {
    mediaElement.addEventListener("playing", onMediaElementPlaying);
    mediaElement.addEventListener("volumechange", onMediaElementVolumeChange);
    mediaElement.addEventListener("pause", onMediaElementPause);
    mediaElement.addEventListener("emptied", onMediaElementEmptied);
}

function removeMediaElementListeners(mediaElement) {
    mediaElement.removeEventListener("playing", onMediaElementPlaying);
    mediaElement.removeEventListener("volumechange", onMediaElementVolumeChange);
    mediaElement.removeEventListener("pause", onMediaElementPause);
    mediaElement.removeEventListener("emptied", onMediaElementEmptied);
}

function plugIntoTab(tab) {
    setIconForTab(tab, STATE_NOT_PLAYING);
    let browser = tab.linkedBrowser;
    let document = browser.contentDocument;
    let mediaElements = [];
    mediaElements.push.apply(mediaElements, document.getElementsByTagName("video"));
    mediaElements.push.apply(mediaElements, document.getElementsByTagName("audio"));
    for (let mediaElement of mediaElements) {
        addMediaElementEventListeners(mediaElement);
        if (!mediaElement.paused) {
            setIconForTab(tab, mediaElement.muted ? STATE_PLAYING_MUTED : STATE_PLAYING);
        }
    }
    let window = tab.ownerDocument.defaultView;
    tab["entObserver"] = new window.MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            for (let addedNode of mutation.addedNodes) {
                if (addedNode.tagName == "VIDEO" || addedNode.tagName == "AUDIO") {
                    addMediaElementEventListeners(addedNode);
                    if (!mediaElement.paused) {
                        setIconForTab(tab, mediaElement.muted ? STATE_PLAYING_MUTED : STATE_PLAYING);
                    }
                }
            }
        });
    });
    tab.entObserver.observe(document.documentElement, {childList: true, subtree: true});
}

function unplugFromTab(tab) {
    let browser = tab.linkedBrowser;
    let document = browser.contentDocument;
    let mediaElements = [];
    mediaElements.push.apply(mediaElements, document.getElementsByTagName("video"));
    mediaElements.push.apply(mediaElements, document.getElementsByTagName("audio"));
    for (let mediaElement of mediaElements) {
        removeMediaElementListeners(mediaElement);
    }
    if (tab.entObserver) {
        tab.entObserver.disconnect();
        tab.entObserver = undefined;
    }
    clearIconFromTab(tab);
}

function onDocumentLoad(event) {
    let document = event.target;
    let tab = findTabForDocument(document);
    plugIntoTab(tab);
}

function onTabMove(event) {
    let tab = event.target;
    plugIntoTab(tab);
}

function fixCloseTabButton(event) {
    let tab = event.target;
    let document = tab.ownerDocument;
    let closeButton = document.getAnonymousElementByAttribute(tab, "anonid", "close-button");
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