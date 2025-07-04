# RedBot UI (Tampermonkey Script)

![RedBot UI Preview](https://raw.githubusercontent.com/phpfail/Redbot-UI/main/preview.png)

**RedBot UI** is a user interface enhancement to make RedBot.gg more then just a chat bot. This script runs via [Tampermonkey](https://www.tampermonkey.net/) and injects the RedBot UI directly into BustaBit.com.

## 🚀 Features

- Clean UI makes placing bets **easy**
- Stop wasting time *typing* your bets
- Bet History tab to track betting performance
- Optional **UT Mode** for betting with the `$UT` command

## ⚙️ Optional: Enable UT Mode

There is an optional configuration flag for users who prefer to use the `$UT` command for betting.

To enable **UT Mode**:

1. Open your Tampermonkey dashboard.
2. Find and edit the `RedBot UI for Bustabit` script.
3. Locate this line at the top:
   ```js
   const ENABLEUT = false,
   ```

4. Change it to:

   ```js
   const ENABLEUT = true,
   ```
5. Save the script.

When enabled, the `BAL` button will be replaced with a `UT` button.


## 📦 Installation

1. Install the [Tampermonkey browser extension](https://www.tampermonkey.net/).

2. Click the link below to install the script directly:

   👉 [Install RedBot UI](https://github.com/phpfail/Redbot-UI/raw/main/redbot-ui.user.js)

3. The script will automatically activate when you are on BustaBit.com/play page.

## 🍆 Tip Me, Daddy

If RedBot UI made your bot hotter, faster, or just less ugly...

**Slide into me** and send a little love 💦  
👉 [**@phpfuck on Bustabit**](https://bustabit.com/user/phpfuck)

Your bits help keep this script thicc, slick, and fully equipped. 💋

