# TestFlight Setup — One-Time Apple Side

After this is done once, every new build ships to TestFlight with a single command:

```bash
./ios/bin/testflight-push.sh
```

Testers (you, your beta users) get an email from Apple and tap **Install** in the TestFlight app.

---

## Prerequisites you must do yourself in a browser

These three steps require interactive Apple ID + 2FA. I can't drive them.

### 1. Apple Developer Program membership

If you don't already have one: enroll at <https://developer.apple.com/programs/> ($99/year). The geknee bundle id `com.geknee.app` must be ownable by your Apple ID.

### 2. App Store Connect API key (gives the script permission to upload)

1. Sign in to <https://appstoreconnect.apple.com/access/api>
2. Click **Keys** → **+** → name it `geknee CI`, role `App Manager`
3. Download the `.p8` file **immediately** (Apple only shows it once)
4. Copy the **Key ID** and **Issuer ID** shown on the page

Save the key to a stable spot:

```bash
mkdir -p ~/.appstoreconnect/private_keys
mv ~/Downloads/AuthKey_*.p8 ~/.appstoreconnect/private_keys/
```

### 3. Create the app record on App Store Connect

1. <https://appstoreconnect.apple.com/apps> → **+** → **New App**
2. Platform: **iOS**, name: **geknee**, bundle id: **com.geknee.app**
3. SKU: anything unique (`geknee-001` is fine)
4. Save. You don't need to fill the rest of the listing for TestFlight.

### 4. Generate a Distribution provisioning profile

1. <https://developer.apple.com/account/resources/profiles/list>
2. **+** → **App Store Distribution** → next
3. Pick the `com.geknee.app` App ID
4. Pick (or create) an iOS Distribution certificate
5. Name it `geknee App Store`, download it, double-click to install in Keychain

---

## Tell the script where the API key lives

Add three lines to your shell rc (`~/.zshrc`):

```bash
export APP_STORE_CONNECT_API_KEY_ID="<paste Key ID from step 2>"
export APP_STORE_CONNECT_API_KEY_ISSUER_ID="<paste Issuer ID from step 2>"
export APP_STORE_CONNECT_API_KEY_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_<KeyID>.p8"
```

`source ~/.zshrc` to load them in this terminal.

---

## Verify

```bash
xcrun altool --validate-app -h
echo "Key ID present? $APP_STORE_CONNECT_API_KEY_ID"
ls "$APP_STORE_CONNECT_API_KEY_PATH"
```

If those three print without errors, the script will work.

---

## Add yourself as an internal tester (one-time)

1. <https://appstoreconnect.apple.com/apps> → **geknee** → **TestFlight** tab
2. Internal Testing → **+** next to a group → add yourself by Apple ID email
3. TestFlight app on your phone: sign in with the same Apple ID

You only do this once. Future builds auto-distribute to you.

---

## Then run the push

```bash
./ios/bin/testflight-push.sh
```

The script:
1. Runs `npx cap sync ios` so the WebView shell + plugin list are current
2. Bumps the build number
3. Archives the app for distribution
4. Exports a signed `.ipa`
5. Uploads it to App Store Connect via the API key
6. Apple processes it (~5 min) and notifies your TestFlight app

You'll get a TestFlight push notification when it's installable. Tap **Install** and it lands on your phone.
