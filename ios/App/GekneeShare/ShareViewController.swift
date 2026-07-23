//
//  ShareViewController.swift
//  GekneeShare
//
//  Doko-style share extension. When the user taps geknee in the iOS share
//  sheet from Instagram / TikTok / YouTube / any URL or text:
//    1. Extract the shared item (URL, text, or video URL) from the context.
//    2. Call POST /api/share-unfurl with the payload — geknee resolves the
//       venue name + lat/lon.
//    3. Show a mini SwiftUI trip picker inside the share sheet: "Add
//       {venue} to which trip?" with the user's trip list (read from the
//       App Group shared UserDefaults, written by the main app on every
//       session start).
//    4. Call POST /api/trips/add-from-share, then close the extension.
//
//  Communication with the main app:
//    - Auth cookie: main app persists `authjs.session-token` value into
//      shared UserDefaults on foreground; we forward it as a Cookie header.
//    - Trip list: cached in shared UserDefaults so the picker renders even
//      when offline.
//    - Pending share (fallback): if the user has no auth or wants to open
//      the main app, we write the share payload to shared UserDefaults and
//      open geknee://share?ts=... — the main app picks it up on appUrlOpen.
//
//  This file is intended to be added to a "Share Extension" target in
//  Xcode named "GekneeShare". See SETUP.md for the manual Xcode steps —
//  we cannot add targets safely via project.pbxproj editing.

import UIKit
import SwiftUI
import UniformTypeIdentifiers

// ── Shared config ──────────────────────────────────────────────────────────

fileprivate let appGroupId = "group.com.geknee.shared"
fileprivate let backendBase = "https://www.geknee.com"

fileprivate func sharedDefaults() -> UserDefaults? {
    UserDefaults(suiteName: appGroupId)
}

fileprivate struct Trip: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let location: String?
}

fileprivate struct UnfurlResult: Codable {
    let venueName: String
    let city: String?
    let country: String?
    let lat: Double?
    let lon: Double?
    let thumbnail: String?
    let source: String
    let sourceUrl: String?
}

// ── Principal class — iOS instantiates this per the Info.plist ─────────────

@objc(ShareViewController)
class ShareViewController: UIViewController {

    private var extractedText: String?
    private var extractedURL: URL?
    private var extractedVideoURL: URL?

    override func viewDidLoad() {
        super.viewDidLoad()
        extractSharedItem { [weak self] in
            self?.presentPicker()
        }
    }

    // Pull whichever attachment type the host app gave us.
    private func extractSharedItem(completion: @escaping () -> Void) {
        guard
            let ctx = extensionContext,
            let items = ctx.inputItems as? [NSExtensionItem]
        else { completion(); return }

        let group = DispatchGroup()
        for item in items {
            for provider in (item.attachments ?? []) {
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    group.enter()
                    provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { data, _ in
                        if let url = data as? URL { self.extractedURL = url }
                        group.leave()
                    }
                } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    group.enter()
                    provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { data, _ in
                        if let text = data as? String { self.extractedText = text }
                        group.leave()
                    }
                } else if provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier) {
                    group.enter()
                    provider.loadItem(forTypeIdentifier: UTType.movie.identifier, options: nil) { data, _ in
                        if let url = data as? URL { self.extractedVideoURL = url }
                        group.leave()
                    }
                }
            }
        }
        group.notify(queue: .main, execute: completion)
    }

    private func presentPicker() {
        let payload: (kind: String, value: String)? = {
            if let url = extractedURL { return ("url", url.absoluteString) }
            if let text = extractedText, !text.isEmpty { return ("text", text) }
            if let vurl = extractedVideoURL { return ("url", vurl.absoluteString) }
            return nil
        }()

        guard let payload else {
            close(cancelled: true)
            return
        }

        let host = UIHostingController(rootView: SharePickerView(
            payloadKind: payload.kind,
            payload: payload.value,
            onDone: { [weak self] in self?.close(cancelled: false) },
            onCancel: { [weak self] in self?.close(cancelled: true) }
        ))
        host.modalPresentationStyle = .overCurrentContext
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)
    }

    private func close(cancelled: Bool) {
        if cancelled {
            extensionContext?.cancelRequest(withError: NSError(domain: "geknee.share", code: 0))
        } else {
            extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
        }
    }
}

// ── SwiftUI mini-UI shown inside the share sheet ────────────────────────────

fileprivate struct SharePickerView: View {
    let payloadKind: String
    let payload: String
    let onDone: () -> Void
    let onCancel: () -> Void

    @State private var stage: Stage = .loading
    @State private var unfurl: UnfurlResult?
    @State private var trips: [Trip] = []
    @State private var selectedTripId: String? = nil
    @State private var errorMessage: String?

    enum Stage { case loading, picking, saving, done, error }

    var body: some View {
        VStack(spacing: 16) {
            header
            switch stage {
            case .loading: loadingView
            case .picking: pickerView
            case .saving:  savingView
            case .done:    doneView
            case .error:   errorView
            }
        }
        .padding(24)
        .background(Color(uiColor: .systemBackground))
        .task { await runUnfurl() }
    }

    private var header: some View {
        HStack {
            Text("geknee")
                .font(.headline).bold()
                .foregroundStyle(Color(red: 0.49, green: 0.23, blue: 0.93))
            Spacer()
            Button("Cancel", action: onCancel)
                .foregroundStyle(.secondary)
        }
    }

    private var loadingView: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text("Finding the location…").foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 160)
    }

    private var pickerView: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let u = unfurl {
                Text(u.venueName).font(.title3).bold()
                if let c = u.city {
                    Text(c).foregroundStyle(.secondary)
                }
            }
            Divider()
            Text("Add to trip").font(.subheadline).bold()
            ScrollView {
                LazyVStack(spacing: 8) {
                    tripRow(id: "new", title: "+ New trip",
                            location: unfurl?.city ?? "Saved from share")
                    ForEach(trips) { trip in
                        tripRow(id: trip.id, title: trip.title,
                                location: trip.location ?? "")
                    }
                }
            }
            .frame(maxHeight: 260)

            Button {
                Task { await runAdd() }
            } label: {
                Text("Add to itinerary")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color(red: 0.49, green: 0.23, blue: 0.93))
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .disabled(selectedTripId == nil)
            .opacity(selectedTripId == nil ? 0.5 : 1)
        }
    }

    private func tripRow(id: String, title: String, location: String) -> some View {
        Button {
            selectedTripId = id
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).foregroundStyle(.primary)
                    if !location.isEmpty {
                        Text(location).font(.caption).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                if selectedTripId == id {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(Color(red: 0.49, green: 0.23, blue: 0.93))
                }
            }
            .padding(12)
            .background(selectedTripId == id
                ? Color(red: 0.49, green: 0.23, blue: 0.93).opacity(0.08)
                : Color(uiColor: .secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    private var savingView: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text("Adding to your itinerary…").foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 160)
    }

    private var doneView: some View {
        VStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 44))
                .foregroundStyle(Color(red: 0.49, green: 0.23, blue: 0.93))
            Text("Added to your trip").font(.headline)
            Button("Done", action: onDone)
                .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, minHeight: 160)
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) { onDone() }
        }
    }

    private var errorView: some View {
        VStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 30))
                .foregroundStyle(.orange)
            Text(errorMessage ?? "Something went wrong")
                .multilineTextAlignment(.center)
            Button("Close", action: onCancel)
        }
        .frame(maxWidth: .infinity, minHeight: 160)
    }

    // MARK: – API calls

    private func runUnfurl() async {
        // Load cached trips first so the picker feels instant.
        trips = loadCachedTrips()

        guard let cookie = sharedDefaults()?.string(forKey: "authCookie") else {
            errorMessage = "Sign in to geknee first, then try again."
            stage = .error
            return
        }

        var req = URLRequest(url: URL(string: "\(backendBase)/api/share-unfurl")!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(cookie, forHTTPHeaderField: "Cookie")
        req.httpBody = try? JSONSerialization.data(withJSONObject: [
            "source": payloadKind,
            "payload": payload,
        ])
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else {
                throw NSError(domain: "unfurl", code: 1)
            }
            unfurl = try JSONDecoder().decode(UnfurlResult.self, from: data)
            stage = .picking
        } catch {
            errorMessage = "Couldn't find the location. Try again in the app."
            stage = .error
        }
    }

    private func runAdd() async {
        guard let u = unfurl, let tripId = selectedTripId,
              let cookie = sharedDefaults()?.string(forKey: "authCookie") else { return }
        stage = .saving

        var req = URLRequest(url: URL(string: "\(backendBase)/api/trips/add-from-share")!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(cookie, forHTTPHeaderField: "Cookie")
        var body: [String: Any] = [
            "tripId": tripId,
            "venueName": u.venueName,
            "source": u.source,
        ]
        if let c = u.city { body["city"] = c }
        if let co = u.country { body["country"] = co }
        if let la = u.lat { body["lat"] = la }
        if let lo = u.lon { body["lon"] = lo }
        if let s = u.sourceUrl { body["sourceUrl"] = s }
        if let t = u.thumbnail { body["thumbnail"] = t }
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)

        do {
            let (_, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else {
                throw NSError(domain: "add", code: 1)
            }
            stage = .done
        } catch {
            errorMessage = "Couldn't add to your itinerary. Try opening geknee directly."
            stage = .error
        }
    }

    private func loadCachedTrips() -> [Trip] {
        guard let data = sharedDefaults()?.data(forKey: "tripsCache") else { return [] }
        return (try? JSONDecoder().decode([Trip].self, from: data)) ?? []
    }
}
