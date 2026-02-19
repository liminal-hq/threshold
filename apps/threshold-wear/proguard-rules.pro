# Threshold Wear OS companion app ProGuard rules

# Keep Wear Data Layer service
-keep class ca.liminalhq.threshold.wear.service.DataLayerListenerService

# Keep data classes used for JSON serialisation
-keep class ca.liminalhq.threshold.wear.data.WatchAlarm { *; }
-keep class ca.liminalhq.threshold.wear.data.SyncResponse { *; }
-keep class ca.liminalhq.threshold.wear.data.SyncResponse$* { *; }
