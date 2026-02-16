use crate::models::SyncReason;

pub trait WearSyncPublisher: Send + Sync {
    fn publish_batch(&self, ids: Vec<i32>, revision: i64);
    fn publish_immediate(&self, reason: &SyncReason, revision: i64);
}

// ── Channel-based publisher ──────────────────────────────────────────

/// Commands sent through the publish channel to the background task
/// that performs the actual Wear Data Layer calls.
#[derive(Debug)]
pub enum PublishCommand {
    /// Publish a batch of changed alarm IDs at the given revision.
    Batch { ids: Vec<i32>, revision: i64 },
    /// Publish an immediate full sync for the given reason.
    Immediate { reason: SyncReason, revision: i64 },
}

/// A publisher that sends commands through a `tokio::sync::mpsc` channel
/// instead of performing the Data Layer calls directly.
///
/// The receiving end of the channel is a background task (spawned in
/// `lib.rs`) that has access to the `AppHandle` and can look up both
/// the `AlarmCoordinator` (for fetching alarm data) and the `WearSync`
/// handle (for calling into Kotlin).
pub struct ChannelPublisher {
    tx: tokio::sync::mpsc::UnboundedSender<PublishCommand>,
}

impl ChannelPublisher {
    pub fn new(tx: tokio::sync::mpsc::UnboundedSender<PublishCommand>) -> Self {
        Self { tx }
    }
}

impl WearSyncPublisher for ChannelPublisher {
    fn publish_batch(&self, ids: Vec<i32>, revision: i64) {
        if let Err(error) = self.tx.send(PublishCommand::Batch { ids, revision }) {
            log::error!("wear-sync: failed to send batch publish command: {error}");
        }
    }

    fn publish_immediate(&self, reason: &SyncReason, revision: i64) {
        if let Err(error) = self.tx.send(PublishCommand::Immediate {
            reason: reason.clone(),
            revision,
        }) {
            log::error!("wear-sync: failed to send immediate publish command: {error}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn channel_publisher_sends_batch() {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let publisher = ChannelPublisher::new(tx);

        publisher.publish_batch(vec![1, 2, 3], 42);

        let cmd = rx.try_recv().unwrap();
        match cmd {
            PublishCommand::Batch { ids, revision } => {
                assert_eq!(ids, vec![1, 2, 3]);
                assert_eq!(revision, 42);
            }
            _ => panic!("Expected Batch command"),
        }
    }

    #[test]
    fn channel_publisher_sends_immediate() {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let publisher = ChannelPublisher::new(tx);

        publisher.publish_immediate(&SyncReason::ForceSync, 100);

        let cmd = rx.try_recv().unwrap();
        match cmd {
            PublishCommand::Immediate { reason, revision } => {
                assert_eq!(reason, SyncReason::ForceSync);
                assert_eq!(revision, 100);
            }
            _ => panic!("Expected Immediate command"),
        }
    }

    #[test]
    fn channel_publisher_logs_on_closed_channel() {
        let (tx, rx) = tokio::sync::mpsc::unbounded_channel();
        let publisher = ChannelPublisher::new(tx);
        drop(rx); // Close the receiver

        // Should not panic, just log an error
        publisher.publish_batch(vec![1], 1);
        publisher.publish_immediate(&SyncReason::Initialize, 1);
    }
}
