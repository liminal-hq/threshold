// Application class — initialises singleton AlarmRepository and WearDataLayerClient
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wear

import android.app.Application
import android.util.Log
import ca.liminalhq.threshold.wear.data.AlarmRepository
import ca.liminalhq.threshold.wear.data.WearDataLayerClient

private const val TAG = "ThresholdWearApp"

/**
 * Application class for the Threshold Wear OS companion app.
 *
 * Provides singleton access to shared resources:
 * - [AlarmRepository]: local alarm cache with observable state
 * - [WearDataLayerClient]: client for sending messages to the phone
 */
class ThresholdWearApp : Application() {

    lateinit var alarmRepository: AlarmRepository
        private set

    lateinit var dataLayerClient: WearDataLayerClient
        private set

    override fun onCreate() {
        super.onCreate()
        alarmRepository = AlarmRepository(this)
        dataLayerClient = WearDataLayerClient(this)
        Log.d(TAG, "Threshold Wear app initialised")
    }
}
