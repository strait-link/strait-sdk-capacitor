import Foundation
import Capacitor
import StraitSDK

/// Capacitor bridge over StraitSDK's `StraitLinks`. All link logic (resolve, deferred check once
/// per install, open reports, retry queue, app-state labels) lives in the native SDK; this class
/// only feeds it the links Capacitor's AppDelegate proxy receives and forwards events to JS as
/// "link" / "linkStart".
@objc(StraitPlugin)
public class StraitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StraitPlugin"
    public let jsName = "Strait"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkDeferred", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "trackEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pendingOpenReports", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "flushOpenReports", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deviceClass", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "doctor", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openStoreSheet", returnType: CAPPluginReturnPromise),
    ]

    private var links: StraitLinks?
    private var subscriptions: [StraitSubscription] = []
    /// A link that arrived before JS called start().
    private var pendingURL: URL?

    override public func load() {
        for name in [Notification.Name.capacitorOpenURL, .capacitorOpenUniversalLink] {
            NotificationCenter.default.addObserver(self, selector: #selector(onOpen(_:)), name: name, object: nil)
        }
    }

    @objc private func onOpen(_ note: Notification) {
        guard let url = (note.object as? [String: Any])?["url"] as? URL else { return }
        DispatchQueue.main.async { [self] in
            if let links = links { links.handle(url: url) } else { pendingURL = url }
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [self] in
            if links != nil { call.resolve(); return } // a WebView reload calls start() again
            let key = call.getString("publishableKey") ?? ""
            let endpoint = call.getString("endpoint") ?? ""
            guard key.hasPrefix("st_pub_"), !endpoint.isEmpty else {
                call.reject("Strait: start needs publishableKey (st_pub_...) and endpoint")
                return
            }
            let hosts = (call.getArray("linkHosts") as? [String]) ?? []
            let l = StraitLinks(StraitLinksConfig(publishableKey: key, endpoint: endpoint, linkHosts: hosts))
            links = l
            subscriptions = [
                l.onLinkStart { [weak self] s in self?.notifyListeners("linkStart", data: Self.js(s), retainUntilConsumed: true) },
                l.onLink { [weak self] e in self?.notifyListeners("link", data: Self.js(e), retainUntilConsumed: true) },
            ]
            // The launch link: delivered before start() (cold start), or remembered by Capacitor.
            let initial = pendingURL ?? ApplicationDelegateProxy.shared.lastURL
            pendingURL = nil
            l.start(initialURL: initial) { call.resolve() }
        }
    }

    @objc func checkDeferred(_ call: CAPPluginCall) {
        guard let l = ready(call) else { return }
        l.checkDeferred { e in call.resolve(Self.js(e)) }
    }

    @objc func trackEvent(_ call: CAPPluginCall) {
        guard let l = ready(call) else { return }
        guard let name = call.getString("name"), !name.isEmpty else {
            call.reject("Strait: trackEvent needs a name")
            return
        }
        l.trackEvent(
            name,
            value: call.getDouble("value"),
            currency: call.getString("currency"),
            linkId: call.getString("linkId"),
            clickId: call.getString("clickId")
        ) { ok in call.resolve(["accepted": ok]) }
    }

    @objc func pendingOpenReports(_ call: CAPPluginCall) {
        guard let l = ready(call) else { return }
        l.pendingOpenReports { n in call.resolve(["count": n]) }
    }

    @objc func flushOpenReports(_ call: CAPPluginCall) {
        guard let l = ready(call) else { return }
        l.flushOpenReports { call.resolve() }
    }

    @objc func deviceClass(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            var r: [String: Any] = [:]
            if let dc = currentDeviceClass() { r["deviceClass"] = dc }
            call.resolve(r)
        }
    }

    /// B23: setup check (debug builds) for this app's bundle ID.
    @objc func doctor(_ call: CAPPluginCall) {
        guard let l = ready(call) else { return }
        l.doctor(bundleId: Bundle.main.bundleIdentifier) { r in
            for f in r.findings { print("[Strait doctor] \(f.severity) \(f.id): \(f.title)\(f.fix.isEmpty ? "" : " → \(f.fix)")") }
            call.resolve([
                "ok": r.ok,
                "findings": r.findings.map { ["id": $0.id, "severity": $0.severity, "title": $0.title, "fix": $0.fix] },
            ])
        }
    }

    /// Store sheet: the App Store inside the app for one of the workspace's links, deep link kept.
    @objc func openStoreSheet(_ call: CAPPluginCall) {
        guard let l = ready(call) else { return }
        guard let url = call.getString("url"), !url.isEmpty else {
            call.reject("Strait: openStoreSheet needs a url")
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let vc = self?.bridge?.viewController else {
                call.resolve(["opened": false, "method": "none", "reason": "no_view"])
                return
            }
            let options = StoreSheetOptions(
                appStoreId: call.getString("appStoreId"),
                providerToken: call.getString("providerToken"),
                customProductPageId: call.getString("customProductPageId"),
                style: StoreSheetStyle(rawValue: call.getString("style") ?? "") ?? .productPage
            )
            let presenter = SystemStoreSheetPresenter(from: vc)
            l.openStoreSheet(url: url, options: options, presenter: presenter) { r in
                _ = presenter // keep the presenter (the store sheet's delegate) alive until done
                var o: [String: Any] = ["opened": r.opened, "method": r.method]
                if let v = r.clickId { o["clickId"] = v }
                if let v = r.linkId { o["linkId"] = v }
                if let v = r.reason { o["reason"] = v }
                call.resolve(o)
            }
        }
    }

    private func ready(_ call: CAPPluginCall) -> StraitLinks? {
        guard let l = links else {
            call.reject("Strait: call start() first")
            return nil
        }
        return l
    }

    static func js(_ e: LinkEvent) -> [String: Any] {
        var o: [String: Any] = [
            "id": e.id, "kind": e.kind.rawValue, "route": e.route.rawValue, "appState": e.appState.rawValue,
            "matched": e.matched, "ms": e.ms, "at": e.at,
        ]
        if let v = e.reason { o["reason"] = v }
        if let v = e.rawUrl { o["rawUrl"] = v }
        if let v = e.url { o["url"] = v }
        if let v = e.path { o["path"] = v }
        if let v = e.params { o["params"] = v }
        if let v = e.linkId { o["linkId"] = v }
        if let v = e.referralCode { o["referralCode"] = v }
        return o
    }

    static func js(_ s: LinkStart) -> [String: Any] {
        var o: [String: Any] = ["id": s.id, "kind": s.kind.rawValue, "appState": s.appState.rawValue, "at": s.at]
        if let v = s.rawUrl { o["rawUrl"] = v }
        return o
    }
}
