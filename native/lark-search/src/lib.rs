// Search input is UTF-8 already case-folded by the browser to preserve its
// locale-independent JavaScript lowercase semantics. File boundaries and
// lengths use little-endian u32. Results contain pairs (file index, line index).
fn read_u32(input: &[u8], offset: &mut usize) -> Option<usize> {
    let end = offset.checked_add(4)?;
    let bytes: [u8; 4] = input.get(*offset..end)?.try_into().ok()?;
    *offset = end;
    Some(u32::from_le_bytes(bytes) as usize)
}
fn read_bytes<'a>(input: &'a [u8], offset: &mut usize, length: usize) -> Option<&'a [u8]> {
    let end = offset.checked_add(length)?;
    let value = input.get(*offset..end)?;
    *offset = end;
    Some(value)
}
fn search(input: &[u8]) -> Option<Vec<u32>> {
    let mut offset = 0;
    let query_len = read_u32(input, &mut offset)?;
    let query = read_bytes(input, &mut offset, query_len)?;
    let count = read_u32(input, &mut offset)?;
    if count > input.len() / 4 {
        return None;
    }
    let mut results = Vec::new();
    for file in 0..count {
        let len = read_u32(input, &mut offset)?;
        let content = read_bytes(input, &mut offset, len)?;
        if query.is_empty() {
            continue;
        }
        for (line, text) in content.split(|b| *b == b'\n').enumerate() {
            if text.windows(query.len()).any(|window| window == query) {
                results.push(u32::try_from(file).ok()?);
                results.push(u32::try_from(line).ok()?);
            }
        }
    }
    if offset != input.len() {
        return None;
    }
    Some(results)
}
struct Entry {
    file: u32,
    line: u32,
    text: Vec<u8>,
}
struct Index {
    entries: Vec<Entry>,
    grams: std::collections::HashMap<[u8; 3], Vec<usize>>,
}
impl Index {
    fn build(input: &[u8]) -> Option<Self> {
        let mut offset = 0;
        let query_len = read_u32(input, &mut offset)?;
        read_bytes(input, &mut offset, query_len)?;
        let count = read_u32(input, &mut offset)?;
        if count > input.len() / 4 {
            return None;
        }
        let mut index = Self {
            entries: Vec::new(),
            grams: std::collections::HashMap::new(),
        };
        let mut postings = 0usize;
        for file in 0..count {
            let len = read_u32(input, &mut offset)?;
            let content = read_bytes(input, &mut offset, len)?;
            for (line, text) in content.split(|b| *b == b'\n').enumerate() {
                if index.entries.len() >= 200_000 {
                    return None;
                }
                let id = index.entries.len();
                let mut seen = std::collections::HashSet::new();
                for gram in text.windows(3) {
                    let gram = [gram[0], gram[1], gram[2]];
                    if seen.insert(gram) {
                        postings += 1;
                        if postings > 1_000_000 {
                            return None;
                        }
                        index.grams.entry(gram).or_default().push(id);
                    }
                }
                index.entries.push(Entry {
                    file: u32::try_from(file).ok()?,
                    line: u32::try_from(line).ok()?,
                    text: text.to_vec(),
                });
            }
        }
        if offset != input.len() {
            return None;
        }
        Some(index)
    }
    fn find(&self, query: &[u8]) -> Vec<u32> {
        if query.is_empty() {
            return Vec::new();
        }
        let mut found = Vec::new();
        let mut check = |entry: &Entry| {
            if entry.text.windows(query.len()).any(|part| part == query) {
                found.push(entry.file);
                found.push(entry.line);
            }
        };
        if query.len() < 3 {
            for entry in &self.entries {
                check(entry);
            }
        } else {
            let mut smallest: Option<&Vec<usize>> = None;
            for gram in query.windows(3) {
                let Some(list) = self.grams.get(&[gram[0], gram[1], gram[2]]) else {
                    return found;
                };
                if smallest.map_or(true, |current| list.len() < current.len()) {
                    smallest = Some(list);
                }
            }
            if let Some(list) = smallest {
                for id in list {
                    check(&self.entries[*id]);
                }
            }
        }
        found
    }
}
thread_local! { static INDEX: std::cell::RefCell<Option<Index>> = const { std::cell::RefCell::new(None) }; }
#[no_mangle]
pub unsafe extern "C" fn build_index(ptr: *const u8, length: u32) -> u32 {
    if ptr.is_null() {
        return 0;
    }
    let index = Index::build(std::slice::from_raw_parts(ptr, length as usize));
    let success = index.is_some();
    INDEX.with(|slot| *slot.borrow_mut() = index);
    u32::from(success)
}
#[no_mangle]
pub unsafe extern "C" fn search_index(ptr: *const u8, length: u32) -> *mut u8 {
    if ptr.is_null() {
        return std::ptr::null_mut();
    }
    let query = std::slice::from_raw_parts(ptr, length as usize);
    INDEX.with(|slot| {
        slot.borrow()
            .as_ref()
            .map_or(std::ptr::null_mut(), |index| {
                encode_results(index.find(query))
            })
    })
}
#[no_mangle]
pub extern "C" fn alloc(length: u32) -> *mut u8 {
    let mut bytes = vec![0u8; length as usize].into_boxed_slice();
    let ptr = bytes.as_mut_ptr();
    std::mem::forget(bytes);
    ptr
}
#[no_mangle]
pub unsafe extern "C" fn free(ptr: *mut u8, length: u32) {
    if !ptr.is_null() {
        drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(
            ptr,
            length as usize,
        )));
    }
}
#[no_mangle]
pub unsafe extern "C" fn search_matches(ptr: *const u8, length: u32) -> *mut u8 {
    if ptr.is_null() {
        return std::ptr::null_mut();
    }
    let input = std::slice::from_raw_parts(ptr, length as usize);
    let matches = match search(input) {
        Some(value) => value,
        None => return std::ptr::null_mut(),
    };
    encode_results(matches)
}
fn encode_results(matches: Vec<u32>) -> *mut u8 {
    let byte_len = match matches
        .len()
        .checked_mul(4)
        .and_then(|n| n.checked_add(4))
        .and_then(|n| u32::try_from(n).ok())
    {
        Some(value) => value,
        None => return std::ptr::null_mut(),
    };
    let mut result = Vec::with_capacity(byte_len as usize);
    result.extend_from_slice(&byte_len.to_le_bytes());
    for value in matches {
        result.extend_from_slice(&value.to_le_bytes());
    }
    let mut result = result.into_boxed_slice();
    let output = result.as_mut_ptr();
    std::mem::forget(result);
    output
}
#[cfg(test)]
mod tests {
    use super::*;
    fn input(q: &str, files: &[&str]) -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(&(q.len() as u32).to_le_bytes());
        out.extend_from_slice(q.as_bytes());
        out.extend_from_slice(&(files.len() as u32).to_le_bytes());
        for f in files {
            out.extend_from_slice(&(f.len() as u32).to_le_bytes());
            out.extend_from_slice(f.as_bytes());
        }
        out
    }
    #[test]
    fn finds_all_matching_lines() {
        assert_eq!(
            search(&input("é", &["é\nno\né", "xé"])),
            Some(vec![0, 0, 0, 2, 1, 0])
        );
    }
    #[test]
    fn malformed_input_is_rejected() {
        assert_eq!(search(&[255, 255, 255, 255]), None);
    }
    #[test]
    fn empty_query_has_no_results() {
        assert_eq!(search(&input("", &["a\nb"])), Some(vec![]));
    }
}
