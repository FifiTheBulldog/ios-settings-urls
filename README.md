# ios-settings-urls

A collection of iOS Settings URLs.

From my post on [r/shortcuts](https://www.reddit.com/r/shortcuts): https://www.reddit.com/r/shortcuts/comments/i9rjbh/an_updated_list_of_settings_urls/

The starting point for this collection, from MacStories: https://www.macstories.net/ios/a-comprehensive-guide-to-all-120-settings-urls-supported-by-ios-and-ipados-13-1/

For a long time, I’ve relied on MacStories’ research for Settings URLs, which have no official documentation from Apple. However, as users on r/shortcuts began to request URLs that were not in the MacStories archive, I did some digging and found about 50 more. Since then, this list has continued to grow to its present form, presented here. Many of the URLs are from MacStories, but some of them are from other users' efforts or my own trial and error. I also corrected a few MacStories ones that no longer work for me.

- [The full list](/settings-urls.md), which contains all the URLs that should work on the latest version of iOS (though some have not been tested on the latest version).
- [Deprecated URLs](/deprecated.md), which worked on older versions of iOS but not the current one (at least when I tested them).

## The Settings URL scheme

The URL scheme to open pages in the iOS Settings app seems to be inconsistent across apps.

- For the Shortcuts app, the only URL scheme that seems to work properly with the paths is `prefs:`.
- For other apps, such as [Scriptable](https://scriptable.app), the correct scheme is `App-prefs:`. (Note the capital `A`.)

As this list was built primarily for Shortcuts users, all URLs presented here use the `prefs:` URL scheme. When you use the `App-prefs:` scheme, the rest of the URL stays the same; the scheme is the only thing that changes.

## Contributing

If you find any URLs that are not included in this list or don't work for you, issues and/or pull requests are welcomed.

~~I also respond to comments on the original Reddit post.~~ **Update:** As of 2021-02-10, the post is 180 days old and is therefore archived. No further comments can be made there, and as it is approaching the character limit for Reddit posts anyway, I have ceased updating it. All futured edits will only be made in this repository, not on the post.

You can also DM me on Reddit ([u/FifiTheBulldog](https://www.reddit.com/user/FifiTheBulldog)), mention me on Twitter ([@FifiTheBulldog](https://twitter.com/FifiTheBulldog)), or find me on the r/shortcuts Discord server (@FifiTheBulldog#6153).

New updates to the MacStories list will be added to this list as well.

## Credits

- [Federico Viticci](https://www.macstories.net/author/viticci/), for his extensive research putting together the efforts of many other users and discovering plenty of URLs on his own. His list on MacStories was the starting point for this one.
- [u/ZJ_Adram](https://www.reddit.com/user/ZJ_Adram) for scouring the file system on his jailbroken device for several SettingsSearchManifest plists, and assembling a list of URLs from those in [this post](https://www.reddit.com/r/shortcuts/comments/lfe5d3/complete_settings_links_list/). This discovery included a treasure trove of previously undocumented URLs, which enabled me to add the majority of the Apple ID and Accessibility URLs, as well as several other previously unknown ones.
- [u/catmilley](https://www.reddit.com/user/catmilley) for the Accessibility → Keyboards URLs
- [u/Setnof](https://www.reddit.com/user/Setnof) for Privacy → Tracking
- [u/BertCrawford](https://www.reddit.com/user/BertCrawford) for Safari → AutoFill
- [u/OnlyForShortcuts](https://www.reddit.com/user/OnlyForShortcuts), [u/CosmicLatteeee](https://www.reddit.com/user/CosmicLatteeee), and [u/KelNishi](https://www.reddit.com/user/KelNishi) for Passwords (iOS 14)
- [u/Jacopeste](https://www.reddit.com/user/Jacopeste) for Safari → Clear History and Website Data
