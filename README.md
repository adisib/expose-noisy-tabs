## Expose Noisy Tabs
This is an extension for Pale Moon web browser which exposes noisy tabs containing audio or video elements. It simply adds indicator icons for tabs when sounds are being played on their websites, but has also possibility to mute them. In addition, it can prevent automatic media playback for new background tabs or at least try to do it as soon as possible.

Works only with HTML5 media elements. Flash is not supported.

### Screenshot
![image](http://i.imgur.com/PCnQVvr.png)

### Usage
After installation the extension should start adding indicator icons for noisy tabs whenever some HTML5 media element on their websites starts playing sound. You can mute these tabs by clicking on their indicators and unmute them by clicking again or you can use Ctrl+M keyboard shortcut for this purpose. All detailed preferences of the extension are accessible within Add-ons Manager page.

### Building
Run build.sh script in a terminal on Linux or any similar environment for Windows like Cygwin. The extension's .xpi archive containing all necessary files will be created automatically.