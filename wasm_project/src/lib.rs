
#[no_mangle]
pub extern "C" fn process_audio_chunk(ptr: *const f32, len: usize) -> i32 {
    let slice = unsafe { std::slice::from_raw_parts(ptr, len) };
    let mut sum_squares = 0.0;
    for &sample in slice {
        sum_squares += sample * sample;
    }
    let rms = (sum_squares / len as f32).sqrt();

    // Thresholds
    // 0: Silence (too quiet)
    // 1: Good
    // 2: Clipping (too loud/distorted)
    // 3: Noisy (implied high variance but low speech? - simplified to RMS for now)

    if rms < 0.01 {
        return 0; // Silence
    } else if rms > 0.9 {
        return 2; // Clipping
    } else {
        return 1; // Good
    }
}

#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut f32 {
    let mut vec = Vec::with_capacity(size);
    let ptr = vec.as_mut_ptr();
    std::mem::forget(vec);
    ptr
}

#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut f32, size: usize) {
    unsafe {
        let _ = Vec::from_raw_parts(ptr, 0, size);
    }
}
