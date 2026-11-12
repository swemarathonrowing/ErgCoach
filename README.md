# ErgCoach

Concept2 PM5 force curves, technique feedback, video analysis and a gamified team erg room.

| Page | Where it runs | What it does |
|---|---|---|
| `index.html` | Phone in the erg's phone holder (landscape) | Connects to the PM5, live force curve, technique analysis, video analysis, diary, levels, badges, the workout game |
| `coach.html` | Laptop plugged into a TV or projector | Workout lobby with QR, step control, live tiles, Spotlight, games, analytics, roster |

---

## Connect your phone to the PM5

The app talks to the PM5 over Bluetooth straight from the web page (Web Bluetooth). **Do not pair the PM5 in the phone's Bluetooth settings.** The browser shows its own device list when you tap *Connect PM5*.

### Before you start (all phones)
1. Wake the PM5: press any button or take a stroke. The PM5 only advertises Bluetooth while it is awake.
2. Close **ErgData, ErgZone, Zwift, Kinomap** or any other rowing app. The PM5 accepts **one** app connection at a time.
3. Turn Bluetooth on.
4. Put the phone in the holder in **landscape**. The app keeps the screen awake while you are in a workout.

### iPhone / iPad
Safari and Chrome on iOS do **not** support Web Bluetooth (Apple blocks it in every iOS browser). Use a Bluetooth-capable browser instead:

1. Install **Bluefy – Web BLE Browser** from the App Store (free).
2. Open Bluefy and go to your ErgCoach link (or scan the coach's QR code with the camera and choose *Open in Bluefy*).
3. Tap your name (the QR code already contains the team code).
4. Tap **Connect PM5**. Bluefy shows a list: pick **PM5 430…** (the number is the PM5's serial number, printed on the back of the monitor).
5. First time only: allow Bluetooth when iOS asks. If you said no by mistake: *Settings → Bluefy → Bluetooth → on*.

Tip: in Bluefy's settings, turn on *Keep screen on*.

### Android
Chrome on Android supports Web Bluetooth out of the box.

1. Open the ErgCoach link in **Chrome** (or scan the QR code with the camera).
2. Join your team: team code → your name → your 4-digit code.
3. Tap **Connect PM5** and pick **PM5 430…** in the list.
4. Allow the permission Android asks for:
   - Android 12 and newer: **Nearby devices**.
   - Android 11 and older: **Location** (Android needs it to scan for Bluetooth devices). Location services must be switched on too.

Samsung Internet and Firefox do not support Web Bluetooth: use Chrome (or Edge).

### Laptop (for testing)
Chrome or Edge on Windows, macOS, ChromeOS and Linux work the same way as Android.

### Heart rate
Any standard Bluetooth chest strap (Polar H10, Garmin HRM-Dual, Wahoo TICKR …): tap **Heart rate strap** in the app and pick it from the list. Without a strap the app uses the heart rate the PM5 reports, if a strap is paired to the PM5.

### If the PM5 does not show up
- Another app or phone is still connected to it: close that app, or switch the other phone's Bluetooth off.
- Restart the PM5: hold *Menu* until it turns off, then wake it again.
- Toggle the phone's Bluetooth off and on.
- The page must be opened over **https** (GitHub Pages is). Web Bluetooth does not work on plain http, except on `localhost`.
- iPhone: make sure you are in **Bluefy**, not Safari.

---

## A coached workout
1. Coach: *Workout* → pick a plan (or build one) → **Open lobby** → **TV mode**.
2. Rowers scan the QR code on the screen, tap their name, connect the PM5, pick a face and tap **I'm in**. No PIN needed; the coach can give a rower an optional 4-digit PIN in the roster.
3. Coach presses **Start**. Steps move on automatically, or the coach presses **Next step**.
4. Each stroke is graded against the target curve, stroke rate or power band: PERFECT, GREAT, GOOD or MISS. Combos raise the multiplier.
5. At the end: awards, badges, your rowing style and the teammate you row most like. The session is saved to your diary.

## Supabase setup (whole team, many ergs)
1. In Supabase, create a new project.
2. Open the SQL editor, paste in `supabase.sql` and run it.
3. Go to Project Settings → API. Copy the Project URL and the `anon` public key into `config.js`:
   `window.ERG_CFG = { url:'https://xxxx.supabase.co', key:'eyJ…' };`
4. Host the folder, for example on GitHub Pages: *Settings → Pages → Deploy from branch → main / root*.

Without `config.js` the app runs on a local demo server that only works between tabs of one browser.

## Security
- All data access goes through security-definer RPC functions. The tables have row-level security on with no policies, so the anon key cannot read them directly.
- Login is QR + name by default. Optional per-rower PINs are hashed with bcrypt; five wrong codes lock that rower out for 10 minutes.
- Live data travels over Supabase Realtime broadcast. Nothing is stored until a session is saved.

## Build
`python3 build.py` joins the source files into the two pages.
