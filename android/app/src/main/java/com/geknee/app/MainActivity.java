package com.geknee.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Parcelable;

import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;

/**
 * MainActivity — Capacitor host, plus Android share-sheet ingest.
 *
 * The manifest declares ACTION_SEND / SEND_MULTIPLE intent-filters for
 * text/plain, image/*, and video/*. When another app punts content into
 * geknee via Share, Android launches this activity with those extras.
 *
 * We stash the payload on a static {@link AndroidSharePlugin#PENDING} slot
 * so the JS bridge can poll it via {@code Capacitor.Plugins.AndroidShare
 * .getPendingShare()} once the WebView finishes bootstrapping. That mirrors
 * the iOS App Group flow, adapted for Android's intent-based model.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AndroidSharePlugin.class);
        super.onCreate(savedInstanceState);
        capturePendingShare(getIntent());
    }

    /** Warm-start path: user taps Share while geknee is already resident. */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        capturePendingShare(intent);
    }

    private void capturePendingShare(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String type = intent.getType();
        if (action == null || type == null) return;

        AndroidSharePlugin.PendingShare share = null;

        if (Intent.ACTION_SEND.equals(action)) {
            if ("text/plain".equals(type)) {
                String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
                String text = intent.getStringExtra(Intent.EXTRA_TEXT);
                share = AndroidSharePlugin.PendingShare.forText(subject, text);
            } else if (type.startsWith("image/") || type.startsWith("video/")) {
                Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                String text = intent.getStringExtra(Intent.EXTRA_TEXT);
                if (stream != null) {
                    List<Uri> one = new ArrayList<>(1);
                    one.add(stream);
                    share = AndroidSharePlugin.PendingShare.forMedia(one, type, text);
                }
            }
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)
                && (type.startsWith("image/") || type.startsWith("video/"))) {
            ArrayList<Parcelable> streams = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (streams != null && !streams.isEmpty()) {
                List<Uri> uris = new ArrayList<>(streams.size());
                for (Parcelable p : streams) {
                    if (p instanceof Uri) uris.add((Uri) p);
                }
                String text = intent.getStringExtra(Intent.EXTRA_TEXT);
                if (!uris.isEmpty()) share = AndroidSharePlugin.PendingShare.forMedia(uris, type, text);
            }
        }

        if (share != null) {
            AndroidSharePlugin.PENDING.set(share);
            // Warm-start path: bridge may already be mounted, so notify it
            // directly instead of waiting for a foreground transition.
            AndroidSharePlugin.firePendingAvailable();
        }
    }
}
