use std::cell::RefCell;
use std::collections::HashMap;

#[derive(Default)]
struct Index { lines: Vec<String>, positions: HashMap<String, Vec<u32>> }
thread_local! { static INDEX: RefCell<Index> = RefCell::new(Index::default()); }

fn whitespace(c: char) -> bool {
    matches!(c, '\u{0009}'..='\u{000d}' | '\u{0020}' | '\u{00a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}
fn normalize(s: &str) -> String { s.split(whitespace).filter(|part| !part.is_empty()).collect::<Vec<_>>().join(" ") }
fn number(data: &[u8], at: &mut usize) -> Option<u32> {
    let bytes = data.get(*at..at.checked_add(4)?)?;
    *at += 4;
    Some(u32::from_le_bytes(bytes.try_into().ok()?))
}
fn string<'a>(data: &'a [u8], at: &mut usize) -> Option<&'a str> {
    let len = number(data, at)? as usize;
    let end = at.checked_add(len)?;
    let result = std::str::from_utf8(data.get(*at..end)?).ok()?;
    *at = end;
    Some(result)
}
fn output(bytes: Vec<u8>) -> *mut u8 {
    let Some(len) = bytes.len().checked_add(4).and_then(|n| u32::try_from(n).ok()) else { return std::ptr::null_mut() };
    let mut result = Vec::with_capacity(len as usize);
    result.extend_from_slice(&len.to_le_bytes()); result.extend_from_slice(&bytes);
    let mut boxed = result.into_boxed_slice(); let ptr = boxed.as_mut_ptr(); std::mem::forget(boxed); ptr
}
#[no_mangle]
pub extern "C" fn alloc(length: u32) -> *mut u8 {
    let mut bytes = vec![0u8; length as usize].into_boxed_slice();
    let ptr = bytes.as_mut_ptr(); std::mem::forget(bytes); ptr
}
#[no_mangle]
pub unsafe extern "C" fn free(ptr: *mut u8, length: u32) {
    if !ptr.is_null() { drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, length as usize))); }
}
#[no_mangle]
pub unsafe extern "C" fn normalize_line(ptr: *const u8, len: u32) -> *mut u8 {
    if ptr.is_null() { return std::ptr::null_mut(); }
    let Ok(text) = std::str::from_utf8(std::slice::from_raw_parts(ptr, len as usize)) else { return std::ptr::null_mut() };
    output(normalize(text).into_bytes())
}
#[no_mangle]
pub unsafe extern "C" fn build_index(ptr: *const u8, len: u32) -> u32 {
    if ptr.is_null() { return 0; }
    let data = std::slice::from_raw_parts(ptr, len as usize); let mut at = 0;
    let Some(count) = number(data, &mut at) else { return 0 };
    if count as usize > data.len() / 4 { return 0; }
    let mut index = Index::default();
    for line in 0..count {
        let Some(text) = string(data, &mut at) else { return 0 };
        let text = normalize(text);
        index.positions.entry(text.clone()).or_default().push(line);
        index.lines.push(text);
    }
    if at != data.len() { return 0; }
    INDEX.with(|slot| *slot.borrow_mut() = index); 1
}
#[no_mangle]
pub unsafe extern "C" fn resolve_anchor(ptr: *const u8, len: u32) -> *mut u8 {
    if ptr.is_null() { return std::ptr::null_mut(); }
    let data = std::slice::from_raw_parts(ptr, len as usize); let mut at = 0;
    let Some(text) = string(data, &mut at) else { return std::ptr::null_mut() };
    let Some(flags) = number(data, &mut at) else { return std::ptr::null_mut() };
    let Some(before) = string(data, &mut at) else { return std::ptr::null_mut() };
    let Some(after) = string(data, &mut at) else { return std::ptr::null_mut() };
    if at != data.len() { return std::ptr::null_mut(); }
    INDEX.with(|slot| {
        let index = slot.borrow(); let mut best = 0; let mut matches = Vec::new();
        for &line in index.positions.get(text).into_iter().flatten() {
            let i = line as usize;
            let score = u32::from(flags & 1 != 0 && i > 0 && index.lines[i - 1] == before)
                + u32::from(flags & 2 != 0 && i + 1 < index.lines.len() && index.lines[i + 1] == after);
            if matches.is_empty() || score > best { matches.clear(); best = score; }
            if score == best { matches.push(line); }
        }
        let status: u32 = if matches.len() > 1 { 2 } else if matches.is_empty() || (best == 0 && (text.is_empty() || flags != 0)) { 0 } else { 1 };
        let mut bytes = Vec::new(); bytes.extend_from_slice(&status.to_le_bytes());
        if status != 0 { for line in matches { bytes.extend_from_slice(&line.to_le_bytes()); } }
        output(bytes)
    })
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn normalizes_js_whitespace() { assert_eq!(normalize("\u{feff} a\t b \u{a0}"), "a b"); assert_eq!(normalize("a\u{85}b"), "a\u{85}b"); }
}
