package ca.liminalhq.threshold.wearsync

import android.util.Log
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService

class WearMessageService : WearableListenerService() {

    override fun onCreate() {
        super.onCreate()
        Log.d("WearMessageService", "Wear message service created")
    }

    override fun onMessageReceived(messageEvent: MessageEvent) {
        Log.d(
            "WearMessageService",
            "Wear message received: path=${messageEvent.path} bytes=${messageEvent.data.size}"
        )
        // TODO: Route messages to the Rust sync pipeline.
    }
}
