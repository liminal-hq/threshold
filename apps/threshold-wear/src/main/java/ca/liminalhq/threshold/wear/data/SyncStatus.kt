package ca.liminalhq.threshold.wear.data

/** Represents the current sync state between the watch and phone. */
enum class SyncStatus {
    /** Connected and up to date with the phone. */
    CONNECTED,

    /** Actively syncing data with the phone. */
    SYNCING,

    /** No connection to the phone (Bluetooth out of range, etc.). */
    OFFLINE,
}
