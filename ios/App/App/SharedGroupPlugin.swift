//
// SharedGroupPlugin.swift
// geknee — Capacitor plugin that lets the web layer write into the
// App Group container shared with the Share Extension (GekneeShare).
//
// Extensions run in their own process and cannot read the main app's
// cookies, keychain items, or Prisma queries. To let the share sheet
// UI act as the logged-in user we mirror two things:
//   - authCookie: value of authjs.session-token, refreshed on every
//     foreground so the extension always calls the API with a valid session
//   - tripsCache: JSON-encoded [{ id, title, location }] so the trip
//     picker renders instantly (and works offline).
//
// JS interface (after Capacitor registers the plugin):
//   Capacitor.Plugins.SharedGroup.setAuthCookie({ cookie: "..." })
//   Capacitor.Plugins.SharedGroup.setTrips({ trips: [...] })
//   Capacitor.Plugins.SharedGroup.readPendingShare()   // → { url, ts } | null
//
// Registration lives in AppDelegate.didFinishLaunchingWithOptions.

import Foundation
import Capacitor

@objc(SharedGroupPlugin)
public class SharedGroupPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SharedGroupPlugin"
    public let jsName = "SharedGroup"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setAuthCookie", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setTrips",      returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readPendingShare", returnType: CAPPluginReturnPromise),
    ]

    private let suiteName = "group.com.geknee.shared"

    private func defaults() -> UserDefaults? {
        UserDefaults(suiteName: suiteName)
    }

    @objc func setAuthCookie(_ call: CAPPluginCall) {
        guard let cookie = call.getString("cookie") else {
            call.reject("cookie required"); return
        }
        defaults()?.set(cookie, forKey: "authCookie")
        call.resolve()
    }

    @objc func setTrips(_ call: CAPPluginCall) {
        guard let trips = call.getArray("trips") else {
            call.reject("trips required"); return
        }
        // Persist as JSON so the Swift-side JSONDecoder can rebuild the array.
        if let data = try? JSONSerialization.data(withJSONObject: trips.rawValue) {
            defaults()?.set(data, forKey: "tripsCache")
        }
        call.resolve()
    }

    // Extension writes { url, ts } to sharedDefaults when it wants the main
    // app to take over (e.g. a "review in app" flow). The main app polls
    // this on foreground; when a pending share is present it navigates the
    // web layer to /share/receive?url=... and clears the key.
    @objc func readPendingShare(_ call: CAPPluginCall) {
        guard let d = defaults(),
              let url = d.string(forKey: "pendingShareUrl") else {
            call.resolve(["hasShare": false])
            return
        }
        let ts = d.double(forKey: "pendingShareTs")
        d.removeObject(forKey: "pendingShareUrl")
        d.removeObject(forKey: "pendingShareTs")
        call.resolve([
            "hasShare": true,
            "url": url,
            "ts": ts,
        ])
    }
}
