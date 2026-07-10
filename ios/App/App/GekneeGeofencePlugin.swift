//
// GekneeGeofencePlugin.swift
// geknee — iOS Capacitor plugin that arms CoreLocation region monitoring
// for the user's saved places and fires a local notification when the OS
// signals the device has entered one.
//
// JS interface (once Capacitor.registerPlugin has run):
//
//   Capacitor.Plugins.GekneeGeofence.arm({
//     fences: [
//       { id: "cxyz", venueName: "Café de Flore", lat: 48.8542, lon: 2.3320,
//         radiusM: 300 }
//     ]
//   })
//
//   Capacitor.Plugins.GekneeGeofence.disarm()
//   Capacitor.Plugins.GekneeGeofence.getMonitored()
//     → { ids: ["cxyz", ...] }
//
// Design notes:
//  - iOS caps a single app at 20 concurrently monitored CLCircularRegions.
//    We assume the server has already trimmed the fences list to 20.
//  - Region monitoring survives app termination and is delivered to
//    application:didFinishLaunchingWithOptions on relaunch. This scaffold
//    handles the foreground entry path; the terminated-relaunch path is a
//    follow-up (needs UIApplication delegate wiring in AppDelegate).
//  - We post a UNNotification directly rather than pinging the server so
//    "you're near X" fires even offline. The server-side /api/geofence
//    trigger (PUT) is called in the background to log + cooldown-check.

import Foundation
import Capacitor
import CoreLocation
import UserNotifications

@objc(GekneeGeofencePlugin)
public class GekneeGeofencePlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "GekneeGeofencePlugin"
    public let jsName = "GekneeGeofence"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "arm",          returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disarm",       returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getMonitored", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
    ]

    private let locationManager: CLLocationManager = CLLocationManager()
    // id → venueName cache so the region-entry callback can build a
    // human-readable notification without waiting on the server.
    private var venueNames: [String: String] = [:]
    private var permissionPromise: CAPPluginCall?

    public override func load() {
        super.load()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        // Always mask if the user hasn't authorized "Always". Region monitoring
        // needs Always to fire when the app is backgrounded — When-in-use only
        // fires when the app is foregrounded.
    }

    @objc func requestPermissions(_ call: CAPPluginCall) {
        // Request location + notifications in parallel. Location dialog first
        // because it needs to happen from a fresh user gesture in the JS shell.
        permissionPromise = call
        DispatchQueue.main.async { [weak self] in
            self?.locationManager.requestAlwaysAuthorization()
        }
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in
            // No-op — permissionPromise is resolved when locationManagerDidChangeAuthorization fires.
        }
    }

    @objc func arm(_ call: CAPPluginCall) {
        guard let fences = call.getArray("fences") as? [[String: Any]] else {
            call.reject("fences: [{ id, venueName, lat, lon, radiusM }] required")
            return
        }
        // Wipe the existing monitored regions before arming — the server's
        // response is authoritative (closest 20 to current lat/lon).
        for r in locationManager.monitoredRegions { locationManager.stopMonitoring(for: r) }
        venueNames.removeAll(keepingCapacity: true)

        var armed: [String] = []
        for f in fences {
            guard
                let id = f["id"] as? String,
                let venueName = f["venueName"] as? String,
                let lat = f["lat"] as? Double,
                let lon = f["lon"] as? Double
            else { continue }
            let radius = (f["radiusM"] as? Double) ?? 300.0

            let region = CLCircularRegion(
                center: CLLocationCoordinate2D(latitude: lat, longitude: lon),
                radius: radius,
                identifier: id
            )
            region.notifyOnEntry = true
            region.notifyOnExit = false
            locationManager.startMonitoring(for: region)
            venueNames[id] = venueName
            armed.append(id)
            if armed.count >= 20 { break } // iOS hard cap
        }

        let ret = JSObject()
        ret["armed"] = armed as AnyObject
        ret["monitored"] = locationManager.monitoredRegions.count as AnyObject
        call.resolve(ret as PluginCallResultData)
    }

    @objc func disarm(_ call: CAPPluginCall) {
        for r in locationManager.monitoredRegions { locationManager.stopMonitoring(for: r) }
        venueNames.removeAll(keepingCapacity: true)
        call.resolve()
    }

    @objc func getMonitored(_ call: CAPPluginCall) {
        let ids = Array(locationManager.monitoredRegions.map { $0.identifier })
        var ret = JSObject()
        ret["ids"] = ids as AnyObject
        call.resolve(ret as PluginCallResultData)
    }

    // MARK: - CLLocationManagerDelegate

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard let call = permissionPromise else { return }
        permissionPromise = nil
        var ret = JSObject()
        switch manager.authorizationStatus {
        case .authorizedAlways:    ret["location"] = "always" as AnyObject
        case .authorizedWhenInUse: ret["location"] = "whenInUse" as AnyObject
        case .denied:              ret["location"] = "denied" as AnyObject
        case .restricted:          ret["location"] = "restricted" as AnyObject
        case .notDetermined:       ret["location"] = "notDetermined" as AnyObject
        @unknown default:          ret["location"] = "unknown" as AnyObject
        }
        call.resolve(ret as PluginCallResultData)
    }

    public func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        // Local notification — fires even if the app is backgrounded /
        // terminated because monitored-region events relaunch the app.
        let venueName = venueNames[region.identifier] ?? "your saved place"
        let content = UNMutableNotificationContent()
        content.title = "You're near \(venueName)"
        content.body = "One of your saved places is just around the corner."
        content.sound = .default
        content.userInfo = [
            "kind": "nearby",
            "placeId": region.identifier,
        ]
        let request = UNNotificationRequest(
            identifier: "nearby.\(region.identifier).\(Date().timeIntervalSince1970)",
            content: content,
            trigger: nil // fire immediately
        )
        UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)

        // Notify JS (foreground) so the bridge can PUT /api/geofence/register
        // for server-side cooldown + logging.
        var event = JSObject()
        event["placeId"] = region.identifier as AnyObject
        event["venueName"] = venueName as AnyObject
        notifyListeners("nearbyEntry", data: event as PluginCallResultData)
    }

    public func locationManager(_ manager: CLLocationManager, monitoringDidFailFor region: CLRegion?, withError error: Error) {
        // No-op for now — server just re-registers on next foreground.
    }
}
