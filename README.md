## Expose Noisy Tabs
This is an extension for Pale Moon web browser which exposes noisy tabs containing audio or video elements. It adds indicator icons for tabs with sound being played on their websites.

### Building
Pack all files (except README.md and build.sh) from this directory into a ZIP archive with .xpi extension. Alternatively, while on Linux, make build.sh an executable via terminal with `chmod +x build.sh` and execute it with `./build.sh` to create the .xpi file.

### Usage
After installation the extension should add indicator icons for noisy tabs whenever some HTML5 media element on their websites starts playing sound. You can mute these tabs by clicking on their indicators and unmute them by clicking again.

### Notice
This is an early version, probably terribly broken in some ways. Also, currently it detects only HTML5 media elements (no Flash). Don't except flawless working.