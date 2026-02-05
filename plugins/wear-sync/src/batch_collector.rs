use std::{
    collections::HashSet,
    sync::Arc,
    time::Duration,
};

use tauri::async_runtime::{JoinHandle, Mutex};

pub type BatchPublish = Arc<dyn Fn(Vec<i32>, i64) + Send + Sync>;

pub struct BatchCollector {
    pending_ids: Arc<Mutex<HashSet<i32>>>,
    latest_revision: Arc<Mutex<i64>>,
    debounce_handle: Arc<Mutex<Option<JoinHandle<()>>>>,
    debounce_ms: u64,
    publish: BatchPublish,
}

impl BatchCollector {
    pub fn new(debounce_ms: u64, publish: BatchPublish) -> Self {
        Self {
            pending_ids: Arc::new(Mutex::new(HashSet::new())),
            latest_revision: Arc::new(Mutex::new(0)),
            debounce_handle: Arc::new(Mutex::new(None)),
            debounce_ms,
            publish,
        }
    }

    pub async fn push(&self, ids: Vec<i32>, revision: i64) {
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
        let publish = Arc::clone(&self.publish);
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
            (publish)(ids, revision);
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
