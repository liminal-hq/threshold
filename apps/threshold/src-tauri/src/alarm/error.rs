use std::fmt;

#[derive(Debug)]
pub enum Error {
    Database(String),
    Scheduler(String),
    Validation(String),
    Tauri(tauri::Error),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Database(msg) => write!(f, "Database error: {}", msg),
            Error::Scheduler(msg) => write!(f, "Scheduler error: {}", msg),
            Error::Validation(msg) => write!(f, "Validation error: {}", msg),
            Error::Tauri(e) => write!(f, "Tauri error: {}", e),
        }
    }
}

impl std::error::Error for Error {}

impl From<&str> for Error {
    fn from(s: &str) -> Self {
        Error::Validation(s.to_string())
    }
}

impl From<String> for Error {
    fn from(s: String) -> Self {
        Error::Validation(s)
    }
}

impl From<serde_json::Error> for Error {
    fn from(e: serde_json::Error) -> Self {
        Error::Database(e.to_string())
    }
}

impl From<sqlx::Error> for Error {
    fn from(e: sqlx::Error) -> Self {
        Error::Database(e.to_string())
    }
}

impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        Error::Database(e.to_string())
    }
}

impl From<chrono::ParseError> for Error {
    fn from(e: chrono::ParseError) -> Self {
        Error::Scheduler(e.to_string())
    }
}

impl From<tauri::Error> for Error {
    fn from(e: tauri::Error) -> Self {
        Error::Tauri(e)
    }
}

pub type Result<T> = std::result::Result<T, Error>;
