//
// ScreenshotDetector.swift
// geknee — emits a `geknee:screenshot` event in the web layer when iOS
// notifies us that the user just took a screenshot of the app.
//
// Lightweight by design: no Photos framework access, no PHAsset fetch,
// no permission prompt. The web side responds by calling
// navigator.share() with the current trip URL — sharing the URL, not
// the captured image.
//
// Wired up in AppDelegate.didFinishLaunchingWithOptions.
//

import UIKit
import Capacitor

@objc class ScreenshotDetector: NSObject {

    static let shared = ScreenshotDetector()
    private var bridge: CAPBridgeProtocol?

    @objc func attach(to bridge: CAPBridgeProtocol) {
        self.bridge = bridge
        NotificationCenter.default.removeObserver(self)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleScreenshot),
            name: UIApplication.userDidTakeScreenshotNotification,
            object: nil
        )
    }

    @objc private func handleScreenshot() {
        // Fire on the main thread — webview.evaluateJavaScript requires it.
        DispatchQueue.main.async { [weak self] in
            guard let webView = self?.bridge?.webView else { return }
            let js = "window.dispatchEvent(new CustomEvent('geknee:screenshot', { detail: { ts: Date.now() } }));"
            webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }
}
