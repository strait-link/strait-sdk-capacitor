package dev.strait.capacitor;

import android.content.Context;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;
import android.util.Log;
import android.util.DisplayMetrics;

import com.android.installreferrer.api.InstallReferrerClient;
import com.android.installreferrer.api.InstallReferrerStateListener;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import dev.strait.sdk.AppLifecycleState;
import dev.strait.sdk.CoreKt;
import dev.strait.sdk.DeviceFields;
import dev.strait.sdk.DoctorFinding;
import dev.strait.sdk.DoctorReport;
import dev.strait.sdk.KeyValueStore;
import dev.strait.sdk.LinkEvent;
import dev.strait.sdk.LinkStart;
import dev.strait.sdk.StoreLauncher;
import dev.strait.sdk.StoreSheetOptions;
import dev.strait.sdk.StoreSheetResult;
import dev.strait.sdk.StraitClient;
import dev.strait.sdk.StraitConfig;
import dev.strait.sdk.UrlConnectionTransport;
import kotlin.Unit;

/**
 * Capacitor bridge over strait-sdk-android's StraitClient. All link logic (resolve, deferred
 * check once per install, open reports, retry queue) lives in the native SDK; this class only
 * wires Android pieces (SharedPreferences, Play Install Referrer, display metrics, intents,
 * lifecycle) and forwards events to JS as "link" / "linkStart".
 */
@CapacitorPlugin(name = "Strait")
public class StraitPlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private StraitClient client;
    /** A link that arrived (onNewIntent) before JS called start(). */
    private String pendingUrl;

    @PluginMethod
    public synchronized void start(PluginCall call) {
        if (client != null) { // a WebView reload calls start() again: keep the one client
            call.resolve();
            return;
        }
        String key = call.getString("publishableKey", "");
        String endpoint = call.getString("endpoint", "");
        if (key == null || !key.startsWith("st_pub_") || endpoint == null || endpoint.isEmpty()) {
            call.reject("Strait: start needs publishableKey (st_pub_...) and endpoint");
            return;
        }
        List<String> hosts = new ArrayList<>();
        JSArray arr = call.getArray("linkHosts", new JSArray());
        for (int i = 0; i < arr.length(); i++) {
            String h = arr.optString(i, null);
            if (h != null && !h.isEmpty()) hosts.add(h);
        }
        Context ctx = getContext().getApplicationContext();
        SharedPreferences prefs = ctx.getSharedPreferences("strait", Context.MODE_PRIVATE);
        KeyValueStore storage = new KeyValueStore() {
            @Override public String get(String k) { return prefs.getString(k, null); }
            @Override public void set(String k, String v) { prefs.edit().putString(k, v).apply(); }
        };
        Intent launch = getActivity() != null ? getActivity().getIntent() : null;
        String debugReferrer = debugReferrer(ctx, launch);
        client = new StraitClient(new StraitConfig(
            key,
            endpoint,
            hosts,
            storage,
            () -> debugReferrer != null ? debugReferrer : readInstallReferrer(ctx),
            "android",
            () -> device(ctx),
            new UrlConnectionTransport(10_000, 10_000),
            executor,
            System::currentTimeMillis,
            deviceClass(ctx)
        ));
        client.onLinkStart(s -> { notifyListeners("linkStart", toJs(s), true); return Unit.INSTANCE; });
        client.onLink(e -> { notifyListeners("link", toJs(e), true); return Unit.INSTANCE; });
        client.onAppState(AppLifecycleState.ACTIVE, System.currentTimeMillis());

        String initial = pendingUrl != null ? pendingUrl : launchUrl(launch);
        pendingUrl = null;
        client.start(initial);
        executor.execute(call::resolve); // after start's work on the same single thread
    }

    @PluginMethod
    public void checkDeferred(PluginCall call) {
        StraitClient c = ready(call);
        if (c == null) return;
        executor.execute(() -> call.resolve(toJs(c.checkDeferred())));
    }

    @PluginMethod
    public void trackEvent(PluginCall call) {
        StraitClient c = ready(call);
        if (c == null) return;
        String name = call.getString("name", "");
        if (name == null || name.isEmpty()) {
            call.reject("Strait: trackEvent needs a name");
            return;
        }
        Double value = call.getDouble("value");
        String currency = call.getString("currency");
        String linkId = call.getString("linkId");
        String clickId = call.getString("clickId");
        executor.execute(() -> {
            JSObject r = new JSObject();
            r.put("accepted", c.trackEvent(name, value, currency, linkId, clickId));
            call.resolve(r);
        });
    }

    @PluginMethod
    public void pendingOpenReports(PluginCall call) {
        StraitClient c = ready(call);
        if (c == null) return;
        JSObject r = new JSObject();
        r.put("count", c.pendingOpenReports());
        call.resolve(r);
    }

    @PluginMethod
    public void flushOpenReports(PluginCall call) {
        StraitClient c = ready(call);
        if (c == null) return;
        executor.execute(() -> { c.flushOpenReports(); call.resolve(); });
    }

    @PluginMethod
    public void deviceClass(PluginCall call) {
        JSObject r = new JSObject();
        String dc = deviceClass(getContext());
        if (dc != null) r.put("deviceClass", dc);
        call.resolve(r);
    }

    /** B23: setup check (debug builds). Sends this app's package and signing certificate(s). */
    @PluginMethod
    public void doctor(PluginCall call) {
        StraitClient c = ready(call);
        if (c == null) return;
        Context ctx = getContext();
        String pkg = ctx.getPackageName();
        List<String> certs = signingCerts(ctx);
        executor.execute(() -> {
            DoctorReport r = c.doctor(pkg, certs);
            JSArray list = new JSArray();
            for (DoctorFinding f : r.getFindings()) {
                JSObject o = new JSObject();
                o.put("id", f.getId());
                o.put("severity", f.getSeverity());
                o.put("title", f.getTitle());
                o.put("fix", f.getFix());
                list.put(o);
                Log.i("StraitDoctor", f.getSeverity() + " " + f.getId() + ": " + f.getTitle() + (f.getFix().isEmpty() ? "" : " → " + f.getFix()));
            }
            JSObject out = new JSObject();
            out.put("ok", r.getOk());
            out.put("findings", list);
            call.resolve(out);
        });
    }

    /** Store sheet: Google Play inside the app for one of the workspace's links, deep link kept. */
    @PluginMethod
    public void openStoreSheet(PluginCall call) {
        StraitClient c = ready(call);
        if (c == null) return;
        String url = call.getString("url", "");
        if (url == null || url.isEmpty()) {
            call.reject("Strait: openStoreSheet needs a url");
            return;
        }
        Context ctx = getContext();
        StoreSheetOptions opts = new StoreSheetOptions(
            call.getString("androidPackage"), ctx.getPackageName(), call.getString("listing"), call.getBoolean("inline", true));
        StoreLauncher launcher = s -> {
            Intent intent = new Intent(s.getAction(), Uri.parse(s.getData()));
            if (s.getPackageName() != null) intent.setPackage(s.getPackageName());
            for (Map.Entry<String, Object> kv : s.getExtras().entrySet()) {
                if (kv.getValue() instanceof Boolean) intent.putExtra(kv.getKey(), (Boolean) kv.getValue());
                else if (kv.getValue() instanceof String) intent.putExtra(kv.getKey(), (String) kv.getValue());
            }
            if (getActivity() == null) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                (getActivity() != null ? getActivity() : ctx).startActivity(intent);
                return true;
            } catch (ActivityNotFoundException e) {
                return false;
            }
        };
        executor.execute(() -> {
            StoreSheetResult r = c.openStoreSheet(url, launcher, opts);
            JSObject o = new JSObject();
            o.put("opened", r.getOpened());
            o.put("method", r.getMethod());
            putIf(o, "clickId", r.getClickId());
            putIf(o, "linkId", r.getLinkId());
            putIf(o, "referrer", r.getReferrer());
            putIf(o, "reason", r.getReason());
            call.resolve(o);
        });
    }

    /** SHA-256 of this build's signing certificate(s), "AB:CD:…" (what assetlinks.json lists). */
    @SuppressWarnings("deprecation")
    private static List<String> signingCerts(Context ctx) {
        List<String> out = new ArrayList<>();
        try {
            PackageManager pm = ctx.getPackageManager();
            Signature[] sigs;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                PackageInfo pi = pm.getPackageInfo(ctx.getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
                sigs = pi.signingInfo == null ? new Signature[0]
                    : pi.signingInfo.hasMultipleSigners() ? pi.signingInfo.getApkContentsSigners() : pi.signingInfo.getSigningCertificateHistory();
            } else {
                sigs = pm.getPackageInfo(ctx.getPackageName(), PackageManager.GET_SIGNATURES).signatures;
            }
            for (Signature sig : sigs) {
                byte[] d = MessageDigest.getInstance("SHA-256").digest(sig.toByteArray());
                StringBuilder b = new StringBuilder();
                for (int i = 0; i < d.length; i++) b.append(i == 0 ? "" : ":").append(String.format("%02X", d[i]));
                out.add(b.toString());
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        String url = launchUrl(intent);
        if (url == null) return;
        synchronized (this) {
            if (client == null) pendingUrl = url;
            else client.handleUrl(url);
        }
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (client != null) client.onAppState(AppLifecycleState.ACTIVE, System.currentTimeMillis());
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        if (client != null) client.onAppState(AppLifecycleState.INACTIVE, System.currentTimeMillis());
    }

    @Override
    protected void handleOnStop() {
        super.handleOnStop();
        if (client != null) client.onAppState(AppLifecycleState.BACKGROUND, System.currentTimeMillis());
    }

    private StraitClient ready(PluginCall call) {
        if (client == null) call.reject("Strait: call start() first");
        return client;
    }

    /** The link in a VIEW intent, but not when Android replays an old intent from the recents screen. */
    private static String launchUrl(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return null;
        if ((intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return null;
        String s = intent.getDataString();
        return s == null || s.isEmpty() ? null : s;
    }

    /**
     * Debug builds only: a stand-in for the Play Install Referrer, so the deferred path can be tested
     * on an emulator (a sideloaded app never gets a Play referrer). Release builds ignore it.
     *   adb shell am start -n <package>/.MainActivity --es strait.debugReferrer "strait_link=lnk_…&strait_click=…"
     */
    private static String debugReferrer(Context ctx, Intent intent) {
        if (intent == null || (ctx.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) == 0) return null;
        String r = intent.getStringExtra("strait.debugReferrer");
        return r == null || r.isEmpty() ? null : r;
    }

    private static DeviceFields device(Context ctx) {
        DisplayMetrics m = ctx.getResources().getDisplayMetrics();
        return new DeviceFields(
            CoreKt.portraitScreenWidth(m.widthPixels / (double) m.density, m.heightPixels / (double) m.density),
            m.density,
            Locale.getDefault().toLanguageTag(),
            TimeZone.getDefault().getID()
        );
    }

    /** Contract B14: the sw600dp rule (600 dp or more = tablet). */
    private static String deviceClass(Context ctx) {
        return CoreKt.deviceClassForSize(ctx.getResources().getConfiguration().smallestScreenWidthDp);
    }

    /** Blocking read of the Play Install Referrer (runs on the SDK's executor), or null. */
    private static String readInstallReferrer(Context ctx) {
        CountDownLatch latch = new CountDownLatch(1);
        String[] result = {null};
        InstallReferrerClient rc = InstallReferrerClient.newBuilder(ctx).build();
        try {
            rc.startConnection(new InstallReferrerStateListener() {
                @Override public void onInstallReferrerSetupFinished(int code) {
                    if (code == InstallReferrerClient.InstallReferrerResponse.OK) {
                        try { result[0] = rc.getInstallReferrer().getInstallReferrer(); } catch (Exception ignored) { }
                    }
                    latch.countDown();
                }
                @Override public void onInstallReferrerServiceDisconnected() { latch.countDown(); }
            });
            latch.await(5, TimeUnit.SECONDS);
        } catch (Exception ignored) {
        } finally {
            try { rc.endConnection(); } catch (Exception ignored) { }
        }
        return result[0];
    }

    static JSObject toJs(LinkEvent e) {
        JSObject o = new JSObject();
        o.put("id", e.getId());
        o.put("kind", e.getKind());
        o.put("route", e.getRoute());
        o.put("appState", e.getAppState());
        o.put("matched", e.getMatched());
        putIf(o, "reason", e.getReason());
        putIf(o, "rawUrl", e.getRawUrl());
        putIf(o, "url", e.getUrl());
        putIf(o, "path", e.getPath());
        putIf(o, "linkId", e.getLinkId());
        putIf(o, "referralCode", e.getReferralCode());
        Map<String, String> params = e.getParams();
        if (params != null) {
            JSObject p = new JSObject();
            for (Map.Entry<String, String> kv : params.entrySet()) p.put(kv.getKey(), kv.getValue());
            o.put("params", p);
        }
        o.put("ms", e.getMs());
        o.put("at", e.getAt());
        return o;
    }

    static JSObject toJs(LinkStart s) {
        JSObject o = new JSObject();
        o.put("id", s.getId());
        o.put("kind", s.getKind());
        o.put("appState", s.getAppState());
        putIf(o, "rawUrl", s.getRawUrl());
        o.put("at", s.getAt());
        return o;
    }

    private static void putIf(JSObject o, String k, String v) {
        if (v != null) o.put(k, v);
    }
}
