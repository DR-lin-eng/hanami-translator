use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, MutexGuard,
    },
};

use tokio::sync::Notify;

#[derive(Default)]
pub struct ProcessingState {
    jobs: Mutex<HashMap<String, Arc<CancellationToken>>>,
}

impl ProcessingState {
    pub fn start(&self, job_id: String) {
        self.jobs()
            .entry(job_id)
            .or_insert_with(|| Arc::new(CancellationToken::default()));
    }

    pub fn token(&self, job_id: &str) -> Arc<CancellationToken> {
        self.jobs()
            .entry(job_id.to_owned())
            .or_insert_with(|| Arc::new(CancellationToken::default()))
            .clone()
    }

    pub fn cancel(&self, job_id: &str) {
        self.token(job_id).cancel();
    }

    pub fn finish(&self, job_id: &str) {
        self.jobs().remove(job_id);
    }

    fn jobs(&self) -> MutexGuard<'_, HashMap<String, Arc<CancellationToken>>> {
        self.jobs.lock().unwrap_or_else(|error| error.into_inner())
    }
}

#[derive(Default)]
pub struct CancellationToken {
    cancelled: AtomicBool,
    notify: Notify,
}

impl CancellationToken {
    pub fn cancel(&self) {
        if !self.cancelled.swap(true, Ordering::AcqRel) {
            self.notify.notify_waiters();
        }
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Acquire)
    }

    pub async fn cancelled(&self) {
        if self.is_cancelled() {
            return;
        }
        let notified = self.notify.notified();
        if self.is_cancelled() {
            return;
        }
        notified.await;
    }
}

#[cfg(test)]
mod tests {
    use super::ProcessingState;

    #[test]
    fn cancelling_a_job_marks_its_shared_token() {
        let state = ProcessingState::default();
        state.start("job-a".into());
        let token = state.token("job-a");

        state.cancel("job-a");

        assert!(token.is_cancelled());
    }

    #[test]
    fn finishing_a_job_removes_its_cancelled_token() {
        let state = ProcessingState::default();
        state.start("job-a".into());
        state.cancel("job-a");
        state.finish("job-a");

        assert!(!state.token("job-a").is_cancelled());
    }

    #[test]
    fn cancellation_wins_if_it_arrives_before_start() {
        let state = ProcessingState::default();
        state.cancel("job-a");

        state.start("job-a".into());

        assert!(state.token("job-a").is_cancelled());
    }
}
