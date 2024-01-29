# komga-sync

A userscript to sync manga chapter progress with tracking websites.

Also features a crop tool that lets you crop and download part of the current page at
original resolution. Press `X` or `touch and hold` while reading to open/close the tool.

## How syncing works

When you start a chapter the script checks the Komga series metadata for links to the respective
series page titled `MangaUpdates`, `MyAnimeList` and `AniList`.
If a link exists and you previously logged into the same site then the script will query your
chapter progress and update it if it is higher.

The script by default uses chapter numbers from Komga which is probably only useful if your
`CBZ` archives contain `ComicInfo.xml` files with correct chapter number or you use other tools
to bulk set metadata.  
It can also parse filenames for chapter numbers, however the parser tends to have issues if the
filename contains unrelated numbers or dates.  
This can be configured globally and overriden per series. When "Parse Filename" is selected then
the parsed chapter number will be displayed below the file field on book pages.

## Usage

Install a userscript manager, I recommend the open-source
[Violentmonkey](https://violentmonkey.github.io/) extension.

Install the minified script from:
<https://lmaonator.github.io/komga-sync/komga-sync.min.user.js>

If you want to see what's going on or modify it then get the normal bundle:
<https://lmaonator.github.io/komga-sync/komga-sync.user.js>

Set the URL for your custom Komga instance if the default @match rules don't already work.
The following steps avoid editing the script source and persist after updates:

- In Violentmonkey, click `</>` next to `komga-sync` to open the script editor.
- At the top click on the `Settings` tab.
- On the right side add your URL under `@match rules`, for example: `https://example.com/manga/*`

Then navigate to a main series page and a `Komga Sync` button should appear on the header at the top right.

There you can login/connect your accounts and link the series to the respective entries on the tracking
websites.

To open the crop tool, press `X` or `touch and hold` while reading a chapter.
Click or tap on the image to select the start point and again to select the end point.
You can then drag the sides and corners to adjust the selection.
Click the center of the selection to crop and download.
The selected area will be cropped from the original image at full resolution.
To cancel the selection and close the tool, press `ESC`, `X` or `touch and hold` again.
