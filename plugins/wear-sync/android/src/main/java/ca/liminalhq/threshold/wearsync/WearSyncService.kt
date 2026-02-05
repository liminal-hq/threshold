package ca.liminalhq.threshold.wearsync

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.util.Log

class WearSyncService : Service() {

    override fun onCreate() {
        super.onCreate()
        Log.d("WearSyncService", "Wear sync service created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d("WearSyncService", "Wear sync service start requested")
        // TODO: Initialise Wear Data Layer publishing work here.
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }
}
