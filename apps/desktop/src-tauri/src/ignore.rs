use ignore::gitignore::Gitignore;
use std::path::{Path, PathBuf};

struct ScopedGitignore {
    scope: PathBuf,
    matcher: Gitignore,
}

pub struct WorkspaceIgnore {
    gitignores: Vec<ScopedGitignore>,
}

impl WorkspaceIgnore {
    pub fn bootstrap() -> Self {
        Self {
            gitignores: Vec::new(),
        }
    }

    pub fn load(root: &Path) -> Self {
        let walker = ignore::WalkBuilder::new(root)
            .hidden(false)
            .git_ignore(true)
            .require_git(false)
            .git_global(false)
            .git_exclude(false)
            .parents(false)
            .filter_entry(|entry| {
                let name = entry.file_name().to_string_lossy();
                name != ".git" && name != "node_modules"
            })
            .build();

        let mut gitignores: Vec<ScopedGitignore> = Vec::new();
        for result in walker {
            let Ok(entry) = result else { continue };
            if !entry.file_type().is_some_and(|ft| ft.is_dir()) {
                continue;
            }
            let dir = entry.path();
            let candidate = dir.join(".gitignore");
            if !candidate.is_file() {
                continue;
            }
            let (matcher, _err) = Gitignore::new(&candidate);
            gitignores.push(ScopedGitignore {
                scope: dir.to_path_buf(),
                matcher,
            });
        }

        gitignores.sort_by_key(|s| std::cmp::Reverse(s.scope.components().count()));

        Self { gitignores }
    }

    pub fn is_ignored(&self, path: &Path, is_dir: bool) -> bool {
        if path_has_safety_component(path) {
            return true;
        }
        for scoped in &self.gitignores {
            if !path.starts_with(&scoped.scope) {
                continue;
            }
            match scoped.matcher.matched_path_or_any_parents(path, is_dir) {
                ignore::Match::Ignore(_) => return true,
                ignore::Match::Whitelist(_) => return false,
                ignore::Match::None => {}
            }
        }
        false
    }
}

fn path_has_safety_component(path: &Path) -> bool {
    path.components().any(|c| {
        let name = c.as_os_str();
        name == "node_modules" || name == ".git"
    })
}

pub fn is_gitignore_path(path: &Path) -> bool {
    path.file_name().is_some_and(|n| n == ".gitignore")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn touch(path: &Path, content: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, content).unwrap();
    }

    #[test]
    fn node_modules_is_always_ignored() {
        let dir = TempDir::new().unwrap();
        let ignore = WorkspaceIgnore::load(dir.path());
        assert!(ignore.is_ignored(&dir.path().join("node_modules"), true));
        assert!(ignore.is_ignored(&dir.path().join("node_modules").join("foo.md"), false));
    }

    #[test]
    fn bootstrap_enforces_only_the_safety_net() {
        let dir = TempDir::new().unwrap();
        let ignore = WorkspaceIgnore::bootstrap();

        assert!(ignore.is_ignored(&dir.path().join("node_modules"), true));
        assert!(ignore.is_ignored(&dir.path().join(".git").join("HEAD"), false));
        assert!(!ignore.is_ignored(&dir.path().join("drafts"), true));
        assert!(!ignore.is_ignored(&dir.path().join("readme.md"), false));
    }

    #[test]
    fn git_dir_is_always_ignored() {
        let dir = TempDir::new().unwrap();
        let ignore = WorkspaceIgnore::load(dir.path());
        assert!(ignore.is_ignored(&dir.path().join(".git").join("HEAD"), false));
    }

    #[test]
    fn root_gitignore_is_applied() {
        let dir = TempDir::new().unwrap();
        touch(&dir.path().join(".gitignore"), "dist/\n*.log\n");
        touch(&dir.path().join("readme.md"), "# Readme");

        let ignore = WorkspaceIgnore::load(dir.path());

        assert!(ignore.is_ignored(&dir.path().join("dist"), true));
        assert!(ignore.is_ignored(&dir.path().join("dist").join("bundle.js"), false));
        assert!(ignore.is_ignored(&dir.path().join("error.log"), false));
        assert!(!ignore.is_ignored(&dir.path().join("readme.md"), false));
    }

    #[test]
    fn nested_star_rule_stays_scoped_to_its_directory() {
        let dir = TempDir::new().unwrap();
        touch(
            &dir.path().join(".vite-hooks").join("_").join(".gitignore"),
            "*\n",
        );
        touch(&dir.path().join("readme.md"), "# Readme");
        touch(&dir.path().join("docs").join("guide.md"), "# Guide");
        touch(
            &dir.path().join(".vite-hooks").join("_").join("hook.sh"),
            "#!/bin/sh",
        );

        let ignore = WorkspaceIgnore::load(dir.path());

        assert!(!ignore.is_ignored(&dir.path().join("readme.md"), false));
        assert!(!ignore.is_ignored(&dir.path().join("docs"), true));
        assert!(!ignore.is_ignored(&dir.path().join("docs").join("guide.md"), false));
        assert!(ignore.is_ignored(
            &dir.path().join(".vite-hooks").join("_").join("hook.sh"),
            false
        ));
    }

    #[test]
    fn nested_gitignore_is_applied() {
        let dir = TempDir::new().unwrap();
        touch(&dir.path().join(".gitignore"), "# empty\n");
        touch(&dir.path().join("docs").join(".gitignore"), "drafts/\n");
        touch(
            &dir.path().join("docs").join("drafts").join("wip.md"),
            "# wip",
        );
        touch(&dir.path().join("docs").join("final.md"), "# final");

        let ignore = WorkspaceIgnore::load(dir.path());

        assert!(ignore.is_ignored(&dir.path().join("docs").join("drafts"), true));
        assert!(ignore.is_ignored(
            &dir.path().join("docs").join("drafts").join("wip.md"),
            false
        ));
        assert!(!ignore.is_ignored(&dir.path().join("docs").join("final.md"), false));
    }

    #[test]
    fn gitignore_file_itself_stays_visible() {
        let dir = TempDir::new().unwrap();
        touch(&dir.path().join(".gitignore"), "dist/\n");

        let ignore = WorkspaceIgnore::load(dir.path());
        assert!(!ignore.is_ignored(&dir.path().join(".gitignore"), false));
    }

    #[test]
    fn unignored_paths_return_false() {
        let dir = TempDir::new().unwrap();
        touch(&dir.path().join("notes").join("hello.md"), "# hi");
        touch(&dir.path().join(".gitignore"), "dist/\n");

        let ignore = WorkspaceIgnore::load(dir.path());
        assert!(!ignore.is_ignored(&dir.path().join("notes"), true));
        assert!(!ignore.is_ignored(&dir.path().join("notes").join("hello.md"), false));
    }

    #[test]
    fn is_gitignore_path_matches_filename() {
        assert!(is_gitignore_path(Path::new("/a/b/.gitignore")));
        assert!(is_gitignore_path(Path::new(".gitignore")));
        assert!(!is_gitignore_path(Path::new("/a/b/gitignore.txt")));
        assert!(!is_gitignore_path(Path::new("/a/b/.gitignore.bak")));
    }
}
