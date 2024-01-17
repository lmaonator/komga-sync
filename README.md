# komga-sync

A userscript to sync manga chapter progress with tracking websites.

## How it works

When you start a chapter the script checks the Komga series metadata for links to the respective
series page titled `MangaUpdates`, `MyAnimeList` and `AniList`.
If a link exists and you previously logged into the same site then the script will query your
chapter progress and update it if it is higher.

The script assumes that your chapter numbers in Komga are the same as the actual number of the
chapter. This can be achieved by the use of `ComicInfo.xml` within `CBZ` archives or otherwise
changing the metadata in Komga.

## Usage

Install a userscript manager, I recommend the open-source
[Violentmonkey](https://violentmonkey.github.io/) extension.

Install the script by navigating to: <https://github.com/lmaonator/komga-sync/raw/main/komga-sync.user.js>

Set the URL for your custom Komga instance if the default @match rules don't already work:

- In Violentmonkey, click `</>` next to `komga-sync` to edit the script.
- At the top click on the `Settings` tab.
- On the right side add your URL under `@match rules`, for example: `https://example.com/manga/*`

Then navigate to a main series page and a `Komga Sync` button should appear on the header at the top right.

There you can login/connect your accounts and link the series to the respective entries on the tracking
websites.
