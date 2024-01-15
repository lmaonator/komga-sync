# komga-sync

A userscript to sync chapter progress with MangaUpdates, AniList and MyAnimeList.

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
