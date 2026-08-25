use objc2::runtime::AnyObject;
use objc2::{class, msg_send};
use std::ffi::CStr;
use std::os::raw::c_char;
use std::ptr;

const NS_UTF8_STRING_ENCODING: usize = 4;

pub(crate) unsafe fn app_delegate() -> Option<*mut AnyObject> {
    let app: *mut AnyObject = unsafe { msg_send![class!(NSApplication), sharedApplication] };
    if app.is_null() {
        return None;
    }
    let delegate: *mut AnyObject = unsafe { msg_send![app, delegate] };
    (!delegate.is_null()).then_some(delegate)
}

pub(crate) unsafe fn ns_string(value: &str) -> *mut AnyObject {
    let string: *mut AnyObject = unsafe { msg_send![class!(NSString), alloc] };
    if string.is_null() {
        return ptr::null_mut();
    }
    let string: *mut AnyObject = unsafe {
        msg_send![
            string,
            initWithBytes: value.as_ptr(),
            length: value.len(),
            encoding: NS_UTF8_STRING_ENCODING
        ]
    };
    if string.is_null() {
        return ptr::null_mut();
    }
    let _: *mut AnyObject = unsafe { msg_send![string, autorelease] };
    string
}

pub(crate) unsafe fn ns_string_to_string(value: *mut AnyObject) -> Option<String> {
    if value.is_null() {
        return None;
    }
    let bytes: *const c_char = unsafe { msg_send![value, UTF8String] };
    if bytes.is_null() {
        return None;
    }
    unsafe { CStr::from_ptr(bytes) }
        .to_str()
        .ok()
        .map(str::to_owned)
}
