# Hosting KoolKisaan Flowers on its OWN Firebase project

The old site (koolkisan.web.app) lives in a different Firebase project. **Do not deploy this repo to it.**
This repo's `firebase.json` names only the hosting site `koolkisaan-flowers`, and there is no `.firebaserc`
in git, so the Firebase CLI cannot pick the old project by accident: you choose the project yourself in step 3.

## 1. Create the new project (once, in the browser)

1. Open https://console.firebase.google.com and click **Add project** (or **Create a project**).
2. Project name: `koolkisaan-flowers` → **Continue**. Google Analytics: switch **off** → **Create project** → **Continue**.
3. Left menu **Build → Hosting** → **Get started** → click **Next** three times → **Continue to console**.
4. In Hosting, look at the site name under "Domains". If it is not `koolkisaan-flowers`
   (the name can be taken, then Firebase adds letters), either
   * click **Add another site**, type `koolkisaan-flowers`, **Add site**; or
   * keep the name Firebase gave and put that name in `firebase.json` → `"site"` (and in the commands below).
5. Left menu **Build → Firestore Database** → **Create database** → location `asia-south1 (Mumbai)` →
   **Start in production mode** → **Create**. (Our own rules are uploaded in step 3 below.)
6. Left menu **Build → Authentication** → **Get started** → **Sign-in method** → **Anonymous** → **Enable** → **Save**.
7. Gear icon → **Project settings** → **General** → "Your apps" → click the web icon `</>` →
   nickname `koolkisaan-flowers-web` → **Register app** → **Continue to console** (no need to copy the config:
   Firebase Hosting serves it to the page by itself).

## 2. Tools (once, on the laptop)

Install Node.js LTS from nodejs.org, then in a Command Prompt:

```
npm install -g firebase-tools
```
```
firebase login
```

## 3. Deploy (in the folder of THIS repo)

```
firebase use --add
```

Pick **koolkisaan-flowers** from the list (NOT the old project), alias `default`. This writes `.firebaserc`
on your laptop only (git ignores it). Check it before every deploy:

```
firebase use
```

It must print `koolkisaan-flowers`. Then:

```
firebase deploy --only hosting:koolkisaan-flowers,firestore
```

The site opens at https://koolkisaan-flowers.web.app. Later updates:

```
git pull
```
```
firebase deploy --only hosting:koolkisaan-flowers
```

## 4. First visit

Open `https://koolkisaan-flowers.web.app/trust.html?role=owner` on the owner's laptop first: that device becomes
the owner (admin) of chamber `CH-FLOWER`. Without Firebase (opening the files from a folder) the Trust & Trade
page works as an offline demo in that browser only.

## Never commit

Service-account JSON files, API keys, `.env`, `.firebaserc`, and the ISHRAE `.epw` weather file. `.gitignore`
already blocks them and a test (`tests/test_flower_twin.py::test_no_secrets_and_no_old_site`) checks it.
