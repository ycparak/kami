use crate::commands::workspace::load_recent_workspaces;
use crate::macos::{app_delegate, ns_string, ns_string_to_string};
use objc2::ffi::class_addMethod;
use objc2::runtime::{AnyClass, AnyObject, Imp, Sel};
use objc2::{class, msg_send, sel};
use std::path::Path;
use std::ptr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

const DOCK_MENU_SIGNATURE: &[u8] = b"@@:@\0";
const MENU_ACTION_SIGNATURE: &[u8] = b"v@:@\0";

static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();
static METHODS_REGISTERED: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, PartialEq, Eq)]
struct RecentWorkspaceMenuItem {
    title: String,
    path: String,
}

pub(crate) fn install(app: &tauri::AppHandle) {
    let _ = APP_HANDLE.set(app.clone());
    if METHODS_REGISTERED.load(Ordering::Acquire) {
        return;
    }

    let registered = unsafe { register_delegate_methods() };
    if registered {
        METHODS_REGISTERED.store(true, Ordering::Release);
    }
}

unsafe fn register_delegate_methods() -> bool {
    let Some(delegate) = (unsafe { app_delegate() }) else {
        eprintln!("failed to install Dock menu: application delegate unavailable");
        return false;
    };

    let delegate_class: *mut AnyClass = unsafe { msg_send![delegate, class] };
    if delegate_class.is_null() {
        eprintln!("failed to install Dock menu: delegate class unavailable");
        return false;
    }

    let dock_menu_imp: Imp = unsafe {
        std::mem::transmute::<
            unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject) -> *mut AnyObject,
            Imp,
        >(application_dock_menu)
    };
    let action_imp: Imp = unsafe {
        std::mem::transmute::<unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject), Imp>(
            open_recent_workspace,
        )
    };

    let action_method_added = unsafe {
        class_addMethod(
            delegate_class,
            sel!(kamiOpenRecentWorkspace:),
            action_imp,
            MENU_ACTION_SIGNATURE.as_ptr().cast(),
        )
        .as_bool()
    };
    if !action_method_added {
        eprintln!("failed to install Dock menu: action selector could not be added");
        return false;
    }

    let dock_method_added = unsafe {
        class_addMethod(
            delegate_class,
            sel!(applicationDockMenu:),
            dock_menu_imp,
            DOCK_MENU_SIGNATURE.as_ptr().cast(),
        )
        .as_bool()
    };
    if !dock_method_added {
        eprintln!("failed to install Dock menu: applicationDockMenu selector could not be added");
        return false;
    }

    true
}

unsafe extern "C-unwind" fn application_dock_menu(
    delegate: *mut AnyObject,
    _cmd: Sel,
    _sender: *mut AnyObject,
) -> *mut AnyObject {
    let Some(app) = APP_HANDLE.get() else {
        return ptr::null_mut();
    };

    let recents = load_recent_workspaces(app).unwrap_or_default();
    let items = recent_workspace_menu_items(&recents);
    if items.is_empty() {
        return ptr::null_mut();
    }

    let menu: *mut AnyObject = unsafe { msg_send![class!(NSMenu), new] };
    if menu.is_null() {
        return ptr::null_mut();
    }

    for item in &items {
        unsafe { add_workspace_menu_item(menu, delegate, item) };
    }

    let _: *mut AnyObject = unsafe { msg_send![menu, autorelease] };
    menu
}

unsafe fn add_workspace_menu_item(
    menu: *mut AnyObject,
    target: *mut AnyObject,
    item: &RecentWorkspaceMenuItem,
) {
    let title = unsafe { ns_string(&item.title) };
    let path = unsafe { ns_string(&item.path) };
    let key_equivalent = unsafe { ns_string("") };
    if title.is_null() || path.is_null() || key_equivalent.is_null() {
        return;
    }

    let menu_item: *mut AnyObject = unsafe { msg_send![class!(NSMenuItem), alloc] };
    if menu_item.is_null() {
        return;
    }
    let menu_item: *mut AnyObject = unsafe {
        msg_send![menu_item, initWithTitle: title, action: sel!(kamiOpenRecentWorkspace:), keyEquivalent: key_equivalent]
    };
    if menu_item.is_null() {
        return;
    }

    unsafe {
        let _: () = msg_send![menu_item, setTarget: target];
        let _: () = msg_send![menu_item, setRepresentedObject: path];
        let _: () = msg_send![menu_item, setToolTip: path];
        let _: () = msg_send![menu, addItem: menu_item];
        let _: *mut AnyObject = msg_send![menu_item, autorelease];
    }
}

unsafe extern "C-unwind" fn open_recent_workspace(
    _delegate: *mut AnyObject,
    _cmd: Sel,
    sender: *mut AnyObject,
) {
    if sender.is_null() {
        return;
    }

    let path_object: *mut AnyObject = unsafe { msg_send![sender, representedObject] };
    let Some(path) = (unsafe { ns_string_to_string(path_object) }) else {
        return;
    };

    let Some(app) = APP_HANDLE.get() else {
        return;
    };

    if let Err(err) = crate::open_new_workspace_window(app, path, None) {
        eprintln!("failed to open workspace from Dock menu: {err:?}");
    }
}

fn recent_workspace_menu_items(recents: &[String]) -> Vec<RecentWorkspaceMenuItem> {
    recents
        .iter()
        .filter(|path| Path::new(path).is_dir())
        .map(|path| RecentWorkspaceMenuItem {
            title: workspace_title(path),
            path: path.clone(),
        })
        .collect()
}

fn workspace_title(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or(path)
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn recent_workspace_items_filter_missing_directories() {
        let dir = tempdir().unwrap();
        let existing = dir.path().join("Existing Workspace");
        std::fs::create_dir(&existing).unwrap();
        let missing = dir.path().join("Missing Workspace");

        let items = recent_workspace_menu_items(&[
            existing.to_string_lossy().to_string(),
            missing.to_string_lossy().to_string(),
        ]);

        assert_eq!(
            items,
            vec![RecentWorkspaceMenuItem {
                title: "Existing Workspace".to_string(),
                path: existing.to_string_lossy().to_string(),
            }]
        );
    }

    #[test]
    fn workspace_title_falls_back_to_full_path() {
        assert_eq!(workspace_title("/"), "/");
    }
}
