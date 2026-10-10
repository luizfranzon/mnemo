use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Condvar, Mutex, MutexGuard};

/// Fila FIFO justa: quem chega primeiro roda primeiro, uma Operação por vez.
/// (Um `Mutex` puro não garante ordem de chegada.)
#[derive(Default)]
pub struct TurnQueue {
    tickets: Mutex<Tickets>,
    changed: Condvar,
    waiting_or_running: AtomicUsize,
}

#[derive(Default)]
struct Tickets {
    next: u64,
    serving: u64,
}

pub struct Turn<'a> {
    queue: &'a TurnQueue,
}

impl TurnQueue {
    /// Bloqueia até chegar a vez.
    pub fn enter(&self) -> Turn<'_> {
        self.waiting_or_running.fetch_add(1, Ordering::SeqCst);
        let mut t = lock(&self.tickets);
        let mine = t.next;
        t.next += 1;
        while t.serving != mine {
            t = self.changed.wait(t).unwrap_or_else(|e| e.into_inner());
        }
        Turn { queue: self }
    }

    /// Só entra se ninguém estiver rodando nem esperando (auto-fetch, watcher).
    pub fn try_enter(&self) -> Option<Turn<'_>> {
        let mut t = lock(&self.tickets);
        if t.next != t.serving {
            return None;
        }
        t.next += 1;
        self.waiting_or_running.fetch_add(1, Ordering::SeqCst);
        Some(Turn { queue: self })
    }

    pub fn is_busy(&self) -> bool {
        self.waiting_or_running.load(Ordering::SeqCst) > 0
    }
}

impl Drop for Turn<'_> {
    fn drop(&mut self) {
        let mut t = lock(&self.queue.tickets);
        t.serving += 1;
        self.queue.waiting_or_running.fetch_sub(1, Ordering::SeqCst);
        self.queue.changed.notify_all();
    }
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::time::Duration;

    #[test]
    fn nunca_roda_em_paralelo_e_respeita_a_ordem() {
        let q = Arc::new(TurnQueue::default());
        let log = Arc::new(Mutex::new(Vec::new()));
        let running = Arc::new(AtomicUsize::new(0));
        let first = q.enter();
        let mut handles = vec![];
        for i in 0..5 {
            let (q, log, running) = (q.clone(), log.clone(), running.clone());
            handles.push(std::thread::spawn(move || {
                let _t = q.enter();
                assert_eq!(running.fetch_add(1, Ordering::SeqCst), 0);
                lock(&log).push(i);
                std::thread::sleep(Duration::from_millis(5));
                running.fetch_sub(1, Ordering::SeqCst);
            }));
            std::thread::sleep(Duration::from_millis(20)); // garante a ordem de chegada
        }
        assert!(q.is_busy());
        drop(first);
        for h in handles {
            h.join().expect("thread");
        }
        assert_eq!(*lock(&log), vec![0, 1, 2, 3, 4]);
        assert!(!q.is_busy());
    }
}
