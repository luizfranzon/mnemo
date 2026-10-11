//! Núcleo do Mnemo: git como processo filho, Operações, Desfazer e Refazer.
//!
//! Camadas (dependências apontam para dentro):
//! `infrastructure` → `application` → `domain`. Nada aqui conhece Electron ou napi.
#![forbid(unsafe_code)]

pub mod api;
pub mod application;
pub mod diag;
pub mod domain;
pub mod infrastructure;

pub use api::Mnemo;
pub use domain::error::{CoreError, Result};
