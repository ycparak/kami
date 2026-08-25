use crate::open_target::{self, PendingOpenPayload};
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

const EXIT_SUCCESS: u8 = 0;
const EXIT_USAGE: u8 = 2;
const EXIT_RUNTIME: u8 = 3;

pub const USAGE: &str = "\
Usage: kami [PATH]

Open a folder or markdown file in the Kami desktop app.

Arguments:
  PATH              Directory or .md/.markdown file to open. If omitted,
                    Kami launches with no target.

Options:
  -h, --help        Print this help and exit.
  -V, --version     Print version and exit.

Environment:
  KAMI_APP_PATH     Override the path to the Kami bundle (macOS) or
                    binary (Linux/Windows). Useful for development builds.
";

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, PartialEq, Eq)]
enum ParsedArgs {
    Help,
    Version,
    Open { path: Option<PathBuf> },
}

#[derive(Debug, PartialEq, Eq)]
enum ParseError {
    UnknownFlag(String),
    TooManyArgs,
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnknownFlag(flag) => write!(f, "unknown option: {flag}"),
            Self::TooManyArgs => write!(f, "expected at most one path argument"),
        }
    }
}

fn parse_args(argv: &[OsString]) -> Result<ParsedArgs, ParseError> {
    let mut positional: Option<PathBuf> = None;

    for arg in argv.iter().skip(1) {
        if let Some(flag) = arg.to_str() {
            match flag {
                "--help" | "-h" => return Ok(ParsedArgs::Help),
                "--version" | "-V" => return Ok(ParsedArgs::Version),
                _ if flag.starts_with('-') => {
                    return Err(ParseError::UnknownFlag(flag.to_string()));
                }
                _ => {}
            }
        }

        if positional.is_some() {
            return Err(ParseError::TooManyArgs);
        }
        positional = Some(PathBuf::from(arg));
    }

    Ok(ParsedArgs::Open { path: positional })
}

fn resolve_input_path(input: &Path, cwd: &Path) -> PathBuf {
    if input.is_absolute() {
        input.to_path_buf()
    } else {
        cwd.join(input)
    }
}

pub trait Launcher {
    fn launch(&self, target: Option<&Path>) -> Result<(), LaunchError>;
}

#[derive(Debug)]
pub enum LaunchError {
    AppNotFound(String),
    Io(std::io::Error),
}

impl std::fmt::Display for LaunchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::AppNotFound(msg) => write!(f, "{msg}"),
            Self::Io(err) => write!(f, "could not launch Kami: {err}"),
        }
    }
}

impl From<std::io::Error> for LaunchError {
    fn from(err: std::io::Error) -> Self {
        Self::Io(err)
    }
}

pub struct SystemLauncher;

impl Launcher for SystemLauncher {
    fn launch(&self, target: Option<&Path>) -> Result<(), LaunchError> {
        launch_system(target)
    }
}

#[cfg(target_os = "macos")]
fn launch_system(target: Option<&Path>) -> Result<(), LaunchError> {
    use std::process::Command;

    let mut cmd = if let Some(override_path) = std::env::var_os("KAMI_APP_PATH") {
        let mut c = Command::new("open");
        c.arg("-a").arg(override_path);
        c
    } else {
        let mut c = Command::new("open");
        c.arg("-a").arg("Kami");
        c
    };

    if let Some(path) = target {
        cmd.arg(path);
    }

    let status = cmd.status()?;
    if !status.success() {
        return Err(LaunchError::AppNotFound(
            "Kami is not installed. Install it from the DMG or set KAMI_APP_PATH.".into(),
        ));
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn launch_system(target: Option<&Path>) -> Result<(), LaunchError> {
    use std::process::Command;

    let program = std::env::var_os("KAMI_APP_PATH").unwrap_or_else(|| {
        if cfg!(target_os = "windows") {
            "kami.exe".into()
        } else {
            "kami-desktop".into()
        }
    });

    let mut cmd = Command::new(&program);
    if let Some(path) = target {
        cmd.arg(path);
    }

    match cmd.spawn() {
        Ok(_) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            Err(LaunchError::AppNotFound(format!(
                "could not find the Kami binary ({}). Install Kami or set KAMI_APP_PATH.",
                program.to_string_lossy()
            )))
        }
        Err(err) => Err(err.into()),
    }
}

pub fn run<L: Launcher>(argv: Vec<OsString>, cwd: &Path, launcher: &L) -> ExitCode {
    match parse_args(&argv) {
        Ok(ParsedArgs::Help) => {
            println!("{USAGE}");
            ExitCode::from(EXIT_SUCCESS)
        }
        Ok(ParsedArgs::Version) => {
            println!("kami {VERSION}");
            ExitCode::from(EXIT_SUCCESS)
        }
        Ok(ParsedArgs::Open { path }) => run_open(path, cwd, launcher),
        Err(err) => {
            fail_usage(err);
            ExitCode::from(EXIT_USAGE)
        }
    }
}

fn run_open<L: Launcher>(path: Option<PathBuf>, cwd: &Path, launcher: &L) -> ExitCode {
    let target: Option<PathBuf> = match path {
        None => None,
        Some(input) => {
            let resolved = resolve_input_path(&input, cwd);
            match open_target::validate_and_resolve(&resolved) {
                Ok(payload) => Some(canonical_target(&payload)),
                Err(err) => {
                    fail_runtime(&err);
                    return ExitCode::from(EXIT_RUNTIME);
                }
            }
        }
    };

    if let Err(err) = launcher.launch(target.as_deref()) {
        fail_runtime(&err);
        return ExitCode::from(EXIT_RUNTIME);
    }

    ExitCode::from(EXIT_SUCCESS)
}

fn canonical_target(payload: &PendingOpenPayload) -> PathBuf {
    payload
        .file
        .as_deref()
        .or(payload.workspace.as_deref())
        .map(PathBuf::from)
        .expect("classify always sets exactly one of file or workspace")
}

fn fail_usage(err: ParseError) {
    eprintln!("kami: {err}");
    eprintln!();
    eprint!("{USAGE}");
}

fn fail_runtime(err: &dyn std::fmt::Display) {
    eprintln!("kami: {err}");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::fs;
    use tempfile::tempdir;

    struct FakeLauncher {
        calls: RefCell<Vec<Option<PathBuf>>>,
        fail: Option<LaunchError>,
    }

    impl FakeLauncher {
        fn new() -> Self {
            Self {
                calls: RefCell::new(Vec::new()),
                fail: None,
            }
        }

        fn failing(err: LaunchError) -> Self {
            Self {
                calls: RefCell::new(Vec::new()),
                fail: Some(err),
            }
        }
    }

    impl Launcher for FakeLauncher {
        fn launch(&self, target: Option<&Path>) -> Result<(), LaunchError> {
            self.calls
                .borrow_mut()
                .push(target.map(|p| p.to_path_buf()));
            match &self.fail {
                Some(LaunchError::AppNotFound(msg)) => Err(LaunchError::AppNotFound(msg.clone())),
                Some(LaunchError::Io(err)) => Err(LaunchError::Io(std::io::Error::new(
                    err.kind(),
                    err.to_string(),
                ))),
                None => Ok(()),
            }
        }
    }

    fn argv(parts: &[&str]) -> Vec<OsString> {
        parts.iter().map(OsString::from).collect()
    }

    #[test]
    fn parse_help_flags() {
        assert_eq!(
            parse_args(&argv(&["kami", "--help"])).unwrap(),
            ParsedArgs::Help
        );
        assert_eq!(
            parse_args(&argv(&["kami", "-h"])).unwrap(),
            ParsedArgs::Help
        );
    }

    #[test]
    fn parse_version_flags() {
        assert_eq!(
            parse_args(&argv(&["kami", "--version"])).unwrap(),
            ParsedArgs::Version
        );
        assert_eq!(
            parse_args(&argv(&["kami", "-V"])).unwrap(),
            ParsedArgs::Version
        );
    }

    #[test]
    fn parse_no_args() {
        assert_eq!(
            parse_args(&argv(&["kami"])).unwrap(),
            ParsedArgs::Open { path: None }
        );
    }

    #[test]
    fn parse_single_path() {
        assert_eq!(
            parse_args(&argv(&["kami", "."])).unwrap(),
            ParsedArgs::Open {
                path: Some(PathBuf::from("."))
            }
        );
    }

    #[test]
    fn parse_rejects_multiple_positional() {
        assert!(matches!(
            parse_args(&argv(&["kami", "a", "b"])),
            Err(ParseError::TooManyArgs)
        ));
    }

    #[test]
    fn parse_rejects_unknown_flag() {
        assert!(matches!(
            parse_args(&argv(&["kami", "--bogus"])),
            Err(ParseError::UnknownFlag(_))
        ));
    }

    #[test]
    fn run_no_args_launches_with_none() {
        let cwd = tempdir().unwrap();
        let launcher = FakeLauncher::new();
        let code = run(argv(&["kami"]), cwd.path(), &launcher);
        assert_eq!(
            format!("{code:?}"),
            format!("{:?}", ExitCode::from(EXIT_SUCCESS))
        );
        assert_eq!(launcher.calls.borrow().as_slice(), &[None]);
    }

    #[test]
    fn run_directory_target_passes_canonical_workspace() {
        let cwd = tempdir().unwrap();
        let target = cwd.path().join("project");
        fs::create_dir(&target).unwrap();

        let launcher = FakeLauncher::new();
        let _ = run(argv(&["kami", "project"]), cwd.path(), &launcher);

        let calls = launcher.calls.borrow();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].as_ref().unwrap(), &target.canonicalize().unwrap());
    }

    #[test]
    fn run_markdown_target_passes_file_path() {
        let cwd = tempdir().unwrap();
        let md = cwd.path().join("note.md");
        fs::write(&md, "").unwrap();

        let launcher = FakeLauncher::new();
        let _ = run(argv(&["kami", "note.md"]), cwd.path(), &launcher);

        let calls = launcher.calls.borrow();
        assert_eq!(calls[0].as_ref().unwrap(), &md.canonicalize().unwrap());
    }

    #[test]
    fn run_unsupported_file_is_runtime_error_without_launch() {
        let cwd = tempdir().unwrap();
        let img = cwd.path().join("pic.png");
        fs::write(&img, "").unwrap();

        let launcher = FakeLauncher::new();
        let code = run(argv(&["kami", "pic.png"]), cwd.path(), &launcher);
        assert_eq!(
            format!("{code:?}"),
            format!("{:?}", ExitCode::from(EXIT_RUNTIME))
        );
        assert!(launcher.calls.borrow().is_empty());
    }

    #[test]
    fn run_missing_path_is_runtime_error() {
        let cwd = tempdir().unwrap();
        let launcher = FakeLauncher::new();
        let code = run(argv(&["kami", "nope.md"]), cwd.path(), &launcher);
        assert_eq!(
            format!("{code:?}"),
            format!("{:?}", ExitCode::from(EXIT_RUNTIME))
        );
        assert!(launcher.calls.borrow().is_empty());
    }

    #[test]
    fn run_bad_flag_is_usage_error() {
        let cwd = tempdir().unwrap();
        let launcher = FakeLauncher::new();
        let code = run(argv(&["kami", "--nope"]), cwd.path(), &launcher);
        assert_eq!(
            format!("{code:?}"),
            format!("{:?}", ExitCode::from(EXIT_USAGE))
        );
        assert!(launcher.calls.borrow().is_empty());
    }

    #[test]
    fn run_propagates_launcher_failure_as_runtime_error() {
        let cwd = tempdir().unwrap();
        let launcher = FakeLauncher::failing(LaunchError::AppNotFound("nope".into()));
        let code = run(argv(&["kami"]), cwd.path(), &launcher);
        assert_eq!(
            format!("{code:?}"),
            format!("{:?}", ExitCode::from(EXIT_RUNTIME))
        );
    }

    #[test]
    fn resolve_input_path_joins_relative_against_cwd() {
        let cwd = Path::new("/tmp/work");
        assert_eq!(resolve_input_path(Path::new("foo"), cwd), cwd.join("foo"));
        assert_eq!(
            resolve_input_path(Path::new("/abs/path"), cwd),
            PathBuf::from("/abs/path")
        );
    }
}
