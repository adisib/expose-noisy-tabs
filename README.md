## Expose Noisy Tabs
This is an extension for Pale Moon web browser, which exposes noisy tabs containing audio or video elements. It simply shows indicator icons for tabs which play sounds, but has also a feature to mute them. In addition, it can prevent automatic media playback for new background tabs or, at least, try to do it as soon as possible.

The extension works only with HTML5 media elements. Flash is not supported.

### Screenshot
![Screenshot](http://i.imgur.com/8MFK1lq.png)

### Usage
After installing the extension, whenever some HTML5 media element starts playing sound inside a tab, an indicator icon should appear after its title. You can mute and unmute such a tab by clicking on that indicator. It can also be done with a Ctrl+M keyboard shortcut. You can adjust some settings regarding visual appearance and specific behavior in the extension's preferences.

### Building
Execute `build.sh` script. The extension .xpi file will be created automatically.