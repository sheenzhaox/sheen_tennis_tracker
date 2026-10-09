# Add Sheen Tennis Tracker to Your Phone

Install the web app on your home screen to open it like an app. No App Store or Google Play download is needed.

**App address:** https://sheen-tennis-tracker.sheenzhaox.workers.dev

## Before You Start

- Connect your phone to the internet.
- Ask the app administrator for your username and password. There is no self-service sign-up.
- Open the link in Safari on iPhone or Chrome on Android, rather than the built-in browser in a messaging app.

## iPhone: Safari

1. Open **Safari** and visit the app address above.
2. Wait for the page to finish loading.
3. Tap **Share** (the square with an upward arrow). Depending on your iOS version, it may be inside the **More** menu.
4. Scroll through the actions and tap **Add to Home Screen**. If it is missing, check **Edit Actions**.
5. Keep the name **Tennis Tracker**. If an **Open as Web App** switch appears, leave it on.
6. Tap **Add**.
7. Return to your home screen and tap the new **Tennis Tracker** icon.
8. Log in with your username and password while online. You may need to log in again even if you already logged in in Safari.

These steps also work on iPad using Safari.

## Android: Chrome

1. Open **Chrome** and visit the app address above.
2. Wait for the page to finish loading.
3. Tap the **three-dot menu**.
4. Tap **Install app** or **Add to Home screen**. The wording varies by phone and Chrome version.
5. If asked, choose **Install**, then confirm the prompts. If only a shortcut option is available, it will still open the website.
6. Find **Tennis Tracker** on your home screen or in your app drawer and open it.
7. Log in with your username and password while online.

## Before Your First Match

1. Open the app from its home-screen icon while online.
2. Open **Settings**, tap **Sync now**, and wait for syncing to finish with no pending changes or errors.
3. Check that the players, rules, and matches you need are available.
4. Before relying on it courtside, briefly turn on airplane mode and reopen the installed app. Check that it opens and your saved data is visible, then turn airplane mode off.

Phone installation and offline behavior have not yet been field-tested for this project. Try this check before your first real match.

## Offline Use and Keeping Your Data Safe

- The app is designed to save recorded points on the phone first and sync them when a connection is available. Your first load and login need internet access.
- Stay logged in if you expect to use the app offline. Login, account management, and sharing changes require a connection.
- After recording a match, reconnect, open **Settings**, and tap **Sync now**. Confirm that there are no pending changes or sync errors before using another device.
- Do not log out, switch accounts, or clear browser/site data while changes are pending. Logging out removes local match data; unsynced changes can be lost.
- Installing the app does not replace cloud sync or guarantee that the phone will retain local data indefinitely.

## Players and Match Setup

- Accounts have **User**, **Coach**, or **Admin** roles. Only admins create accounts and clubs, using **Settings > Manage users / Manage clubs**. Create a system-level player before linking a new User account; a Coach account may have clubs without a player profile. Existing unlinked accounts remain usable until an admin assigns their profiles.
- **Manage users** lists accounts alphabetically by username. Tap a username to edit its profile, reset its password, or enable/disable it. The search bar filters live after three trimmed characters, matching anywhere in username, full name, or email, ignoring case. With fewer than three characters, all accounts are shown.
- Account profiles have optional **Name** (full name) and **Email**, including on the New user form. They are stored separately from the linked player's details, visible to admins and the account itself, and do not change username/password login. Admins can edit these fields on legacy unlinked accounts without first assigning a player.
- Players and coaches can belong to multiple clubs. Only admins change club memberships and player visibility/ownership. Club names must be unique, ignoring case.
- **Manage clubs** shows each club's linked players in its own section, folded by default. Tap **Players (count)** to expand or fold the list. A player belonging to multiple clubs appears under each one. Tap a player name to open their profile and adjust details or memberships; Back and saving return to Clubs. Historical free-text club names alone do not count as memberships.
- **Players** shows your private players, your linked system profile, and players you originally created that an admin has promoted. Coaches additionally see system players in their assigned clubs. Admins see and manage all players, including users' private lists.
- Player forms in **Players** require **Name** and **Gender** (**Male** or **Female**). **New match** can create name-only private players; complete gender and optional email later in Players. **Email** is optional but recommended for future account management; email login is not implemented. Email is visible only to admins and the private owner or linked account. Older profiles without gender remain available; choose a gender when saving profile changes.
- You may edit your linked player profile, but cannot delete it or change its clubs/ownership. A user-created player is private until an admin explicitly makes it system-level. Previous free-text club names on private players are retained as historical information, not club memberships.
- **Notes (only seen by you)** are personal to your account; admins may also view/manage them. Different users' notes on the same player are separate. Promoting a player never promotes their notes. You can save your private notes even when the player profile is view only.
- In new match setup, type a name into **Player A** or **Player B**. After three characters, suggestions match anywhere in the name, ignoring case, across your players and admin-added players.
- Explicitly select a suggestion to reuse that player. Otherwise, enter any non-empty name and press **Next**: a new private player is created in your list, even if the name already exists but you did not select it. This also applies to admins. There is no Add player button, gender selector, or email field in match setup. New players and the match are saved together only when setup is valid. The same existing player cannot be selected for both sides; separate people may have identical names. Admins still create system-level players through Players.
- Users see their own recorded matches and explicitly shared matches, not automatically every match involving their linked profile. Coaches additionally see matches involving at least one system player in any of their assigned clubs. Coaches can view match/player statistics and manage public stats links for those club matches, but can edit, record, finalise, or delete only their own matches. Admins can manage all matches.
- On the home page, choose **Stats & Analysis**, then **Match stats** or **Player stats**. Match stats lists your own matches first, followed by matches shared with you; coaches also see club-accessible matches, and admins can view other users' matches. Open a match to view its stats and use Back to return to the list.
- Player stats are available only for **System Players**. Normal users go directly to the System Player linked to their account. Coaches select a System Player in one of their assigned clubs; admins can search/select any System Player. Private players are excluded, including when opening a player stats address directly. A user without a linked profile should ask an administrator to link one.
- Player stats use completed matches only, including manually finalised matches, and default to **Last match**. Choose **Last 3 matches**, **Within a month**, **Last 6 months**, or **Customize**. Month filters are rolling calendar-month windows through today, based on the match day; legacy matches without a day fall back to recorded timestamps. Month-end boundaries clamp to the last day of the earlier month. Customize lets you check individual completed matches, select all or clear the selection. No selected matches means no combined stats.
- Only matches already visible to your account contribute to player stats; linking a player does not grant extra match access. Statistics use the System Player's ID, not matching names: choose that System Player's suggestion in New match if you want the match included, rather than creating a same-named private player. Each match keeps its own scoring rules, and Lucky ball rules remain unchanged. The eligible Player stats button on a player profile opens the same filters.
- Player stats show only the selected player's statistics, not combined opponent statistics. Opponent names remain in Customize's match list. Lists with more than five matches scroll within a bounded area; Select all and Clear selection still apply to the entire list.
- Membership and role changes refresh on sync. Revoked club access removes cached matches/points at the next successful sync; it does not delete them from the cloud. Data already viewed or stored offline cannot be remotely erased while a device is disconnected. Existing public links remain active until explicitly revoked.

## Rally Shot Details

- Rally **Shot direction** uses **Down line**. Under **Shot type**, use **Drive volley** for a drive volley; Topspin is no longer offered for new points.
- Stats keep older Topspin records as **Topspin (legacy)** when present in the selected data. Unspecified shot types appear as **Not set**, not Drive volley. These labels also apply to shared stats and point-log CSV exports.
- The **Shot type** stats section has **Forehand / Backhand** filter buttons. Select one to count only that stroke; tap it again to clear it. Neither selected includes both strokes and shots with stroke not set. This applies to player, match and shared stats.
- In match and shared stats, **Shot type** and **Unforced errors** start with player-selection buttons. Each section defaults to Player A and shows only its selected player's table; selections are independent. Player stats need no player selector.
- A point marked **Lucky ball** counts only in the Summary's total **Winners**. It is excluded from all other statistics, including **Points won**, serve percentages, and rally/shot breakdowns. It still counts toward the actual match score and stays in the point log.
- **Unforced errors** uses shot-direction rows and **Net / Long / Wide / Total** columns for the selected player. Forehand/Backhand and Baseline/Approach/Net buttons keep their existing filters. Missing directions (including double faults) appear as **Not set**; recorded return directions are used when available. **Total** also includes errors without a recorded error type.

## Finalising or Deleting a Match

- On **Matches**, use the small **Finalise** button on the right of an in-progress match. Choose who won, then choose **[first player's name] retired**, **[second player's name] retired**, or **Didn't record the remaining**, and confirm.
- Finalising moves the match to **Finished** and keeps only the points you actually recorded. The saved winner and reason appear in the match and stats, including public stats links. Player 1 is the first player listed; Player 2 is the second.
- Finalise from **Matches**, not the point recording screen. **Undo finalisation** on the tracker reopens the match without deleting any recorded points.
- On **Matches**, use the small **Delete** button on the right and confirm to remove an in-progress or finished match and its recorded points. Scheduled matches can also be deleted. Deletion cannot be undone, and public stats links stop working once the deletion syncs.
- You can only change or delete your own matches; shared matches are view-only. Admins can manage all matches. These changes save locally offline and sync when you reconnect.

## Sharing Stats with a Coach

- Open the match's **Stats** page and choose **Create link**, then **Copy link**. Send that public link, not the private Stats page address.
- Anyone with the link can view stats online without an account. If an older cached version asks for login, refresh the browser.
- Return to Stats to see and copy the same link. **Create new link** replaces it; **Revoke link** disables it. Both require a connection.
- Older links created before link retrieval was added still work. Paste the original URL into **Existing public stats link** and choose **Restore existing link** once to make it available on subsequent visits without replacing it.
- Point observations and private match metadata are not included in public stats.

## Troubleshooting

| Problem | What to try |
| --- | --- |
| No Add to Home Screen or Install option | Open the link directly in Safari on iPhone or Chrome on Android. Update the browser if needed. |
| App asks you to log in | Connect to the internet and use the account supplied by the administrator. |
| Matches are missing | Check that you are using the correct account, then use Settings > Sync now. Another user's match must be shared with your account before you can see it. Shared matches are view-only. |
| A player you added is unexpectedly view-only | Refresh the updated app while online, sign in as the user who added it, then use Settings > Sync now. This refreshes server-assigned ownership without clearing local data. Admin-added shared players are searchable in match setup, but do not appear in a normal user's Players list. |
| App will not open offline | Reconnect and open the installed app fully while online, then repeat the offline check. Do not clear site data if you have unsynced changes. |
| Changes are not appearing on another phone | On the recording phone, reconnect and sync with no pending changes. Then open the app on the other phone and sync there too. |
