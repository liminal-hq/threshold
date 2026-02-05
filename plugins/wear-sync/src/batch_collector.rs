use std::{
    collections::HashSet,
    sync::Arc,
    time::Duration,
};

use tauri::async_runtime::{JoinHandle, Mutex};

use crate::publisher::WearSyncPublisher;

pub struct BatchCollector {
    pending_ids: Arc<Mutex<HashSet<i32>>>,
    latest_revision: Arc<Mutex<i64>>,
    debounce_handle: Arc<Mutex<Option<JoinHandle<()>>>>,
    debounce_ms: u64,
    publisher: Arc<dyn WearSyncPublisher>,
}

impl BatchCollector {
    pub fn new(debounce_ms: u64, publisher: Arc<dyn WearSyncPublisher>) -> Self {
        Self {
            pending_ids: Arc::new(Mutex::new(HashSet::new())),
            latest_revision: Arc::new(Mutex::new(0)),
            debounce_handle: Arc::new(Mutex::new(None)),
            debounce_ms,
            publisher,
        }
    }

    pub async fn add(&self, ids: Vec<i32>, revision: i64) {
        if ids.is_empty() {
            return;
        }

        {
            let mut pending = self.pending_ids.lock().await;
            pending.extend(ids);
        }

        {
            let mut latest = self.latest_revision.lock().await;
            *latest = revision;
        }

        let mut handle = self.debounce_handle.lock().await;
        if let Some(existing) = handle.take() {
            existing.abort();
        }

        let pending_ids = Arc::clone(&self.pending_ids);
        let latest_revision = Arc::clone(&self.latest_revision);
        let publisher = Arc::clone(&self.publisher);
        let debounce_ms = self.debounce_ms;

        let task = tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(debounce_ms)).await;

            let ids = {
                let mut pending = pending_ids.lock().await;
                if pending.is_empty() {
                    return;
                }
                pending.drain().collect::<Vec<_>>()
            };

            let revision = *latest_revision.lock().await;
            publisher.publish_batch(ids, revision);
        });

        *handle = Some(task);
    }

    pub async fn flush(&self) -> Option<(Vec<i32>, i64)> {
        let mut handle = self.debounce_handle.lock().await;
        if let Some(existing) = handle.take() {
            existing.abort();
        }

        let ids = {
            let mut pending = self.pending_ids.lock().await;
            if pending.is_empty() {
                return None;
            }
            pending.drain().collect::<Vec<_>>()
        };

        let revision = *self.latest_revision.lock().await;
        Some((ids, revision))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::SyncReason;
    use crate::publisher::WearSyncPublisher;
    use std::sync::{Arc, Mutex};
    use tokio::time::{sleep, Duration};

    #[derive(Default)]
    struct TestPublisher {
        batches: Arc<Mutex<Vec<(Vec<i32>, i64)>>>,
        immediate: Arc<Mutex<Vec<(SyncReason, i64)>>>,
    }

    impl WearSyncPublisher for TestPublisher {
        fn publish_batch(&self, ids: Vec<i32>, revision: i64) {
            self.batches.lock().unwrap().push((ids, revision));
        }

        fn publish_immediate(&self, reason: &SyncReason, revision: i64) {
            self.immediate
                .lock()
                .unwrap()
                .push((reason.clone(), revision));
        }
    }

    #[tokio::test]
    async fn debounce_coalesces_batches() {
        let publisher = Arc::new(TestPublisher::default());
        let publisher_trait: Arc<dyn WearSyncPublisher> = publisher.clone();
        let collector = BatchCollector::new(500, publisher_trait);

        collector.add(vec![1], 10).await;
        sleep(Duration::from_millis(300)).await;
        collector.add(vec![2], 11).await;

        sleep(Duration::from_millis(300)).await;
        assert!(publisher.batches.lock().unwrap().is_empty());

        sleep(Duration::from_millis(250)).await;
        let batches = publisher.batches.lock().unwrap();
        assert_eq!(batches.len(), 1);
        let (mut ids, revision) = batches[0].clone();
        ids.sort_unstable();
        assert_eq!(ids, vec![1, 2]);
        assert_eq!(revision, 11);
    }

    #[tokio::test]
    async fn flush_clears_pending_set() {
        let publisher = Arc::new(TestPublisher::default());
        let publisher_trait: Arc<dyn WearSyncPublisher> = publisher.clone();
        let collector = BatchCollector::new(500, publisher_trait);

        collector.add(vec![3, 4], 22).await;
        let flushed = collector.flush().await;
        assert!(flushed.is_some());

        let (mut ids, revision) = flushed.unwrap();
        ids.sort_unstable();
        assert_eq!(ids, vec![3, 4]);
        assert_eq!(revision, 22);

        sleep(Duration::from_millis(600)).await;
        assert!(publisher.batches.lock().unwrap().is_empty());
        assert!(collector.flush().await.is_none());
    }

    #[tokio::test]
    async fn concurrent_add_merges_ids() {
        let publisher = Arc::new(TestPublisher::default());
        let publisher_trait: Arc<dyn WearSyncPublisher> = publisher.clone();
        let collector = Arc::new(BatchCollector::new(500, publisher_trait));

        let first = {
            let collector = Arc::clone(&collector);
            tokio::spawn(async move {
                collector.add(vec![7], 30).await;
            })
        };
        let second = {
            let collector = Arc::clone(&collector);
            tokio::spawn(async move {
                collector.add(vec![8], 31).await;
            })
        };

        let _ = tokio::join!(first, second);

        sleep(Duration::from_millis(550)).await;
        let batches = publisher.batches.lock().unwrap();
        assert_eq!(batches.len(), 1);
        let (mut ids, revision) = batches[0].clone();
        ids.sort_unstable();
        assert_eq!(ids, vec![7, 8]);
        assert_eq!(revision, 31);
    }
}
