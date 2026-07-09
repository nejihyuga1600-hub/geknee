package com.geknee.app;

import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

/**
 * AndroidSharePlugin — Capacitor plugin that exposes any content received
 * via the Android share sheet (see MainActivity + AndroidManifest.xml) to
 * the JS layer.
 *
 * JS interface (once Capacitor.registerPlugin has run):
 *   Capacitor.Plugins.AndroidShare.getPendingShare()
 *      → { hasShare: false }                                  // nothing pending
 *      → { hasShare: true, kind: "text", text, subject? }     // ACTION_SEND text/plain
 *      → { hasShare: true, kind: "media", mimeType, items: [ { base64, name, size } ], caption? }
 *
 * The plugin ALWAYS clears PENDING after a successful read so the same share
 * isn't replayed on the next foreground.
 *
 * MAX_BYTES caps a single media blob at 8 MB — /api/share/analyze-media
 * enforces the same limit. Larger items report { skipped: true } instead
 * of blowing the WebView bridge.
 */
@CapacitorPlugin(name = "AndroidShare")
public class AndroidSharePlugin extends Plugin {

    static final AtomicReference<PendingShare> PENDING = new AtomicReference<>(null);
    /** Live plugin instance so MainActivity.onNewIntent can fire a bridge event
     *  without going through JS polling. Set on load, cleared on handleOnDestroy. */
    static final AtomicReference<AndroidSharePlugin> ACTIVE = new AtomicReference<>(null);

    private static final int MAX_BYTES = 8 * 1024 * 1024;

    @Override
    public void load() {
        super.load();
        ACTIVE.set(this);
        // If a share was captured before JS mounted, fire once now so the
        // NativeShareBridge listener (installed on load) drains it.
        if (PENDING.get() != null) notifyPendingShareAvailable();
    }

    @Override
    protected void handleOnDestroy() {
        ACTIVE.compareAndSet(this, null);
        super.handleOnDestroy();
    }

    /** Called by MainActivity.onNewIntent after PENDING.set(...) to nudge JS. */
    static void firePendingAvailable() {
        AndroidSharePlugin plugin = ACTIVE.get();
        if (plugin != null) plugin.notifyPendingShareAvailable();
    }

    private void notifyPendingShareAvailable() {
        JSObject event = new JSObject();
        event.put("hasShare", true);
        notifyListeners("pendingShareAvailable", event);
    }

    @PluginMethod
    public void getPendingShare(PluginCall call) {
        PendingShare share = PENDING.getAndSet(null);
        JSObject ret = new JSObject();
        if (share == null) {
            ret.put("hasShare", false);
            call.resolve(ret);
            return;
        }
        ret.put("hasShare", true);
        try {
            if (share.kind == PendingShare.Kind.TEXT) {
                ret.put("kind", "text");
                if (share.text != null) ret.put("text", share.text);
                if (share.subject != null) ret.put("subject", share.subject);
            } else {
                ret.put("kind", "media");
                if (share.mimeType != null) ret.put("mimeType", share.mimeType);
                if (share.text != null) ret.put("caption", share.text);
                JSArray items = new JSArray();
                ContentResolver cr = getContext().getContentResolver();
                for (Uri uri : share.uris) {
                    JSObject item = readOne(cr, uri);
                    items.put(item);
                }
                ret.put("items", items);
            }
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("failed to read share: " + e.getMessage(), e);
        }
    }

    private JSObject readOne(ContentResolver cr, Uri uri) throws JSONException {
        JSObject item = new JSObject();
        String name = displayName(cr, uri);
        long size = displaySize(cr, uri);
        if (name != null) item.put("name", name);
        item.put("size", size);
        if (size > MAX_BYTES) {
            item.put("skipped", true);
            item.put("skipReason", "over " + MAX_BYTES + " bytes; downsize before sharing");
            return item;
        }
        try (InputStream in = cr.openInputStream(uri)) {
            if (in == null) {
                item.put("skipped", true);
                item.put("skipReason", "could not open stream");
                return item;
            }
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[16 * 1024];
            int n;
            int total = 0;
            while ((n = in.read(chunk)) != -1) {
                total += n;
                if (total > MAX_BYTES) {
                    item.put("skipped", true);
                    item.put("skipReason", "over " + MAX_BYTES + " bytes; downsize before sharing");
                    return item;
                }
                buf.write(chunk, 0, n);
            }
            String b64 = Base64.encodeToString(buf.toByteArray(), Base64.NO_WRAP);
            item.put("base64", b64);
        } catch (Exception e) {
            item.put("skipped", true);
            item.put("skipReason", e.getMessage() != null ? e.getMessage() : "read failed");
        }
        return item;
    }

    private String displayName(ContentResolver cr, Uri uri) {
        try (Cursor c = cr.query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) return c.getString(idx);
            }
        } catch (Exception ignored) {}
        return null;
    }

    private long displaySize(ContentResolver cr, Uri uri) {
        try (Cursor c = cr.query(uri, new String[]{OpenableColumns.SIZE}, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int idx = c.getColumnIndex(OpenableColumns.SIZE);
                if (idx >= 0) return c.getLong(idx);
            }
        } catch (Exception ignored) {}
        return -1;
    }

    /** Immutable snapshot of an Android share intent. */
    public static class PendingShare {
        public enum Kind { TEXT, MEDIA }
        public final Kind kind;
        public final String text;
        public final String subject;
        public final String mimeType;
        public final List<Uri> uris;

        private PendingShare(Kind kind, String text, String subject, String mimeType, List<Uri> uris) {
            this.kind = kind;
            this.text = text;
            this.subject = subject;
            this.mimeType = mimeType;
            this.uris = uris;
        }

        public static PendingShare forText(String subject, String text) {
            return new PendingShare(Kind.TEXT, text, subject, "text/plain", null);
        }

        public static PendingShare forMedia(List<Uri> uris, String mimeType, String caption) {
            return new PendingShare(Kind.MEDIA, caption, null, mimeType, uris);
        }
    }
}
