use crate::models::SyncReason;

pub trait WearSyncPublisher: Send + Sync {
    fn publish_batch(&self, ids: Vec<i32>, revision: i64);
    fn publish_immediate(&self, reason: &SyncReason, revision: i64);
}
